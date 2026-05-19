import copy
import re
from dataclasses import dataclass
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model


WORK_SHIFTS = ["早", "日", "遅", "夜", "明"]
CONSECUTIVE_WORK_SHIFTS = ["早", "日", "遅", "夜"]
BLANK_SHIFT = "空"
URGENT_REST_SHIFT = "休"
ABSENCE_SHIFT = "欠"
SUPPLY_EXCLUDED_SHIFT = "除"
SUPPLY_EXCLUDED_SHIFTS = ["出張", "産休", "育休", "休職", "病欠", SUPPLY_EXCLUDED_SHIFT]
REST_COUNT_SHIFTS = ["公", URGENT_REST_SHIFT]
ASSIGNABLE_SHIFTS = ["早", "日", "遅", "夜", "明", "公", URGENT_REST_SHIFT, ABSENCE_SHIFT] + SUPPLY_EXCLUDED_SHIFTS + [BLANK_SHIFT]
SUPPLY_EXCLUSION_TYPES = {"出張", "供給除外", "休職", "産休", "育休", "長期病欠", "入職前", "退職後"}
SUPPLY_EXCLUSION_TO_SHIFT = {
    "出張": "出張",
    "産休": "産休",
    "育休": "育休",
    "休職": "休職",
    "長期病欠": "病欠",
    "入職前": BLANK_SHIFT,
    "退職後": BLANK_SHIFT,
    "供給除外": BLANK_SHIFT,
}
SUPPLY_EXCLUSION_DISPLAY_SHIFT = {"休職": "休", BLANK_SHIFT: ""}
WEIGHT_SAME_SHIFT_RUN = 650
WEIGHT_ALLOWED_SHORTAGE = 500000
WEIGHT_ISOLATED_WORKDAY = 250
WEIGHT_ISOLATED_PUBLIC_HOLIDAY = 220
WEIGHT_LATE_TO_REST = 1000
WEIGHT_POST_REST_EARLY = 1000
WEIGHT_LATE_TO_NIGHT = 8000
REQUEST_TO_SHIFT = {
    "希望早出": "早",
    "希望日勤": "日",
    "希望遅出": "遅",
    "希望夜勤": "夜",
    "事前希望休": "公",
    "有給": "公",
    "特別休": "公",
}
WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
FIXED_OFF = {
    "毎週日曜": 0,
    "毎週月曜": 1,
    "毎週火曜": 2,
    "毎週水曜": 3,
    "毎週木曜": 4,
    "毎週金曜": 5,
    "毎週土曜": 6,
}


@dataclass
class Staff:
    role: str
    name: str
    condition: str
    allowed_shifts: List[str]
    allowed_days: List[int]
    fixed_off: int
    gender: str
    previous_tail: List[str]


def _boolish(value) -> bool:
    return value is True or str(value).upper() == "TRUE"


def _normalize_digits(text: str) -> str:
    return str(text or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def _parse_allowed_shifts(text: str) -> List[str]:
    normalized = str(text or "").replace("夜勤", "夜")
    return [item for item in normalized.split("・") if item in ["早", "日", "遅", "夜"]]


def _parse_allowed_days(row: dict) -> List[int]:
    days = [i for i, key in enumerate(WEEKDAY_KEYS) if _boolish(row.get(key))]
    return days if days else list(range(7))


def _parse_date_day(date_text: str) -> int:
    match = re.search(r"/\s*(\d+)", str(date_text or ""))
    return int(match.group(1)) if match else 0


def _weekday_index(year: int, month: int, day_index: int) -> int:
    import datetime as _dt

    # Python weekday: Monday=0. GAS/JS convention used here: Sunday=0.
    value = _dt.date(year, month, day_index + 1).weekday()
    return (value + 1) % 7


def _monthly_work_limit(days_in_month: int) -> int:
    return max(0, days_in_month - _public_holiday_target(days_in_month))


def _public_holiday_target(days_in_month: int) -> int:
    if days_in_month == 31:
        return 10
    if days_in_month == 30:
        return 9
    if days_in_month == 29:
        return 9
    if days_in_month == 28:
        return 8
    return max(0, days_in_month - 21)


def _night_target(condition: str):
    match = re.search(r"月\s*(\d+)\s*回", _normalize_digits(condition))
    return int(match.group(1)) if match else None


def _replace_night_target(condition: str, target: int) -> str:
    text = str(condition or "").strip()
    if re.search(r"月\s*\d+\s*回", _normalize_digits(text)):
        return re.sub(r"月\s*[0-9０-９]+\s*回", f"月{target}回", text)
    return (text + " " if text else "") + f"月{target}回"


def _night_density_profile(target: int, available_days: int) -> dict:
    if not target or target <= 0 or available_days <= 0:
        return {
            "target": target or 0,
            "availableDays": max(0, available_days),
            "averageGap": None,
            "densityClass": "none",
            "tightNightBlockWeight": 0,
            "shortNightGapWeight": 0,
        }
    average_gap = available_days / target
    if average_gap <= 4.0:
        density_class = "high"
        tight_weight = 65000
        short_gap_weight = 2200
    elif average_gap <= 5.2:
        density_class = "medium"
        tight_weight = 150000
        short_gap_weight = 4500
    else:
        density_class = "low"
        tight_weight = 300000
        short_gap_weight = 8000
    return {
        "target": target,
        "availableDays": available_days,
        "averageGap": round(average_gap, 2),
        "densityClass": density_class,
        "tightNightBlockWeight": tight_weight,
        "shortNightGapWeight": short_gap_weight,
    }


def _clamp_weight(value: float, minimum: int = 0, maximum: int = 1000000) -> int:
    return max(minimum, min(maximum, int(round(value))))


def _build_shift_eligible_counts(staff: List[Staff], year: int, month: int, days: int) -> Dict[str, int]:
    counts = {shift: 0 for shift in ["早", "日", "遅", "夜"]}
    for shift in counts:
        for item in staff:
            if shift not in item.allowed_shifts:
                continue
            if any(_weekday_index(year, month, day) in item.allowed_days for day in range(days)):
                counts[shift] += 1
    return counts


def _build_shift_eligible_counts_by_day(
    staff: List[Staff],
    year: int,
    month: int,
    days: int,
    supply_exclusions: Dict[Tuple[str, int], dict],
    requests: Dict[Tuple[str, int], Tuple[str, bool]],
) -> Dict[str, List[int]]:
    counts = {shift: [0 for _ in range(days)] for shift in ["早", "日", "遅", "夜"]}
    for day_index in range(days):
        weekday = _weekday_index(year, month, day_index)
        for shift in counts:
            for item in staff:
                if shift not in item.allowed_shifts:
                    continue
                if weekday not in item.allowed_days:
                    continue
                if item.fixed_off == weekday:
                    continue
                if (item.name, day_index) in supply_exclusions:
                    continue
                request = requests.get((item.name, day_index))
                if request and request[1]:
                    continue
                forced_shift = _forced_carryover_shift(item, day_index)
                if forced_shift and forced_shift != shift:
                    continue
                counts[shift][day_index] += 1
    return counts


def _pressure_discount(required: dict, eligible_counts: Dict[str, int], shift: str) -> float:
    req = max(0, int(required.get(shift) or 0))
    eligible = max(1, int(eligible_counts.get(shift) or 0))
    if req <= 0:
        return 0.65
    pressure = req / eligible
    if pressure >= 0.45:
        return 0.60
    if pressure >= 0.33:
        return 0.75
    return 1.0


def _day_shift_pressure_multiplier(required: dict, eligible_counts_by_day: Dict[str, List[int]], shift: str, day_index: int) -> float:
    req = max(0, int(required.get(shift) or 0))
    if req <= 0:
        return 0.60
    day_counts = eligible_counts_by_day.get(shift) or []
    eligible = day_counts[day_index] if 0 <= day_index < len(day_counts) else 0
    surplus = eligible - req
    if surplus <= 0:
        return 0.25
    if surplus == 1:
        return 0.45
    if surplus == 2:
        return 0.75
    return 1.0


def _build_shift_pressure_profile(required: dict, eligible_counts_by_day: Dict[str, List[int]], shift: str) -> List[dict]:
    req = max(0, int(required.get(shift) or 0))
    return [
        {
            "day": day_index + 1,
            "required": req,
            "eligible": eligible,
            "surplus": eligible - req,
            "weightMultiplier": _day_shift_pressure_multiplier(required, eligible_counts_by_day, shift, day_index),
        }
        for day_index, eligible in enumerate(eligible_counts_by_day.get(shift) or [])
    ]


def _naturalness_weight_profile(
    item: Staff,
    required: dict,
    eligible_counts: Dict[str, int],
    night_density: dict,
) -> dict:
    allowed_count = len(item.allowed_shifts)
    limited_shift_staff = allowed_count <= 2
    rest_exempt = _is_rest_target_exempt(item)
    night_class = str((night_density or {}).get("densityClass") or "none")

    same_weight = WEIGHT_SAME_SHIFT_RUN
    if limited_shift_staff:
        same_weight *= 0.45
    if item.allowed_shifts == ["夜"]:
        same_weight = 0

    isolated_workday_weight = WEIGHT_ISOLATED_WORKDAY
    isolated_public_holiday_weight = WEIGHT_ISOLATED_PUBLIC_HOLIDAY
    if rest_exempt:
        isolated_workday_weight *= 0.25
        isolated_public_holiday_weight *= 0.20
    elif limited_shift_staff:
        isolated_workday_weight *= 0.70
        isolated_public_holiday_weight *= 0.70

    late_to_rest_weight = WEIGHT_LATE_TO_REST
    if limited_shift_staff and "遅" in item.allowed_shifts:
        late_to_rest_weight *= 0.95
    late_to_rest_weight *= _pressure_discount(required, eligible_counts, "遅")

    post_rest_early_weight = WEIGHT_POST_REST_EARLY
    post_rest_early_weight *= _pressure_discount(required, eligible_counts, "早")
    if "早" not in item.allowed_shifts:
        post_rest_early_weight = 0

    late_to_night_weight = WEIGHT_LATE_TO_NIGHT
    if night_class == "high":
        late_to_night_weight *= 0.70
    elif night_class == "medium":
        late_to_night_weight *= 0.85

    return {
        "sameShiftRun": _clamp_weight(same_weight),
        "isolatedWorkday": _clamp_weight(isolated_workday_weight),
        "isolatedPublicHoliday": _clamp_weight(isolated_public_holiday_weight),
        "lateToRest": _clamp_weight(late_to_rest_weight),
        "postRestEarly": _clamp_weight(post_rest_early_weight),
        "lateToNight": _clamp_weight(late_to_night_weight),
    }


def _is_night_only_staff(item: Staff) -> bool:
    return item.role == "夜専" or item.allowed_shifts == ["夜"]


def _is_external_blank_allowed_role(role: str) -> bool:
    return role in {"夜専", "バイト", "介護部応援", "看護部応援"}


def _is_blank_allowed_staff(item: Staff) -> bool:
    return _is_external_blank_allowed_role(item.role) or item.allowed_shifts == ["夜"]


def _is_rest_target_exempt(item: Staff) -> bool:
    return (
        item.role in {"施設長", "バイト", "介護部応援", "看護部応援"}
        or "介護請求不可" in item.condition
        or _is_night_only_staff(item)
    )


def _load_staff(payload: dict) -> List[Staff]:
    previous_by_name = payload.get("previousMonthTailByName") or {}
    current_by_name = {row.get("name"): row for row in payload.get("currentSchedule") or []}
    staff = []
    for row in payload.get("staffConditions") or []:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        allowed = _parse_allowed_shifts(row.get("allowedShift") or row.get("shift") or "")
        role = str(row.get("staffType") or row.get("role") or "")
        condition = str(row.get("condition") or "")
        if not allowed and role == "夜専" and condition.strip():
            allowed = ["夜"]
        has_current = any((current_by_name.get(name) or {}).get("shifts") or [])
        if not allowed and not has_current:
            continue
        fixed_off = FIXED_OFF.get(str(row.get("fixedOff") or "").strip(), -1)
        staff.append(
            Staff(
                role=role,
                name=name,
                condition=condition,
                allowed_shifts=allowed,
                allowed_days=_parse_allowed_days(row),
                fixed_off=fixed_off,
                gender=str(row.get("gender") or ""),
                previous_tail=list(previous_by_name.get(name) or []),
            )
        )
    return staff


def _build_flexible_night_targets(staff: List[Staff], total_night_demand: int) -> Dict[int, int]:
    fixed_total = 0
    flexible_indices = []
    for index, item in enumerate(staff):
        target = _night_target(item.condition)
        if target is not None and "夜" in item.allowed_shifts:
            fixed_total += target
        elif "夜" in item.allowed_shifts and not _is_night_only_staff(item):
            flexible_indices.append(index)

    if not flexible_indices:
        return {}

    remaining = max(0, total_night_demand - fixed_total)
    base = remaining // len(flexible_indices)
    extra = remaining % len(flexible_indices)
    targets = {}
    for order, index in enumerate(flexible_indices):
        targets[index] = base + (1 if order < extra else 0)
    return targets


def _build_requests(payload: dict) -> Dict[Tuple[str, int], Tuple[str, bool]]:
    out = {}
    for entry in payload.get("leaveEntries") or []:
        name = str(entry.get("name") or "").strip()
        request_type = str(entry.get("type") or "").strip()
        shift = REQUEST_TO_SHIFT.get(request_type)
        day = _parse_date_day(entry.get("date"))
        if name and shift and day:
            out[(name, day - 1)] = (shift, request_type in ["事前希望休", "有給", "特別休"])
    return out


def _build_supply_exclusions(payload: dict) -> Dict[Tuple[str, int], dict]:
    out = {}
    for entry in payload.get("supplyExclusions") or []:
        name = str(entry.get("name") or entry.get("staffName") or "").strip()
        start = _parse_date_day(entry.get("startDate") or entry.get("date"))
        end = _parse_date_day(entry.get("endDate") or entry.get("date")) or start
        if name and start > 0 and end >= start:
            for day in range(start, end + 1):
                out[(name, day - 1)] = entry
    for entry in payload.get("leaveEntries") or []:
        leave_type = str(entry.get("type") or "").strip()
        if leave_type not in SUPPLY_EXCLUSION_TYPES:
            continue
        name = str(entry.get("name") or "").strip()
        day = _parse_date_day(entry.get("date"))
        if name and day > 0:
            out[(name, day - 1)] = entry
    return out


def _hard_requests_by_name_day(payload: dict) -> Dict[Tuple[str, int], str]:
    out = {}
    for entry in payload.get("leaveEntries") or []:
        request_type = str(entry.get("type") or "").strip()
        if request_type not in {"事前希望休", "有給", "特別休"}:
            continue
        name = str(entry.get("name") or "").strip()
        day = _parse_date_day(entry.get("date"))
        if name and day:
            out[(name, day - 1)] = request_type
    return out


def _forced_carryover_shift(item: Staff, day_index: int) -> str:
    last_previous_shift = item.previous_tail[-1] if item.previous_tail else ""
    if last_previous_shift == "夜":
        if day_index == 0:
            return "明"
        if day_index == 1:
            return "公"
    if last_previous_shift == "明" and day_index == 0:
        return "公"
    return ""


def _top_reason_counts(candidates: List[dict]) -> List[str]:
    counts = {}
    for candidate in candidates:
        for reason in candidate.get("blockedReasons") or []:
            counts[reason] = counts.get(reason, 0) + 1
    return [
        f"{reason}x{count}"
        for reason, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:5]
    ]


def _build_infeasible_diagnostics(payload: dict, staff: List[Staff]) -> dict:
    year = int(payload.get("targetYear") or 0)
    month = int(payload.get("targetMonth") or 0)
    days = int(payload.get("daysInMonth") or 0)
    required = payload.get("requiredShiftStaffing") or {}
    core_shifts = payload.get("requiredCoreShiftTypes") or ["夜", "早", "遅"]
    hard_requests = _hard_requests_by_name_day(payload)
    supply_exclusions = _build_supply_exclusions(payload)
    shortage_diagnostics = []
    hard_conflicts = []
    hard_request_dates = {}
    carryover_dates = {}

    for (name, day_index), request_type in hard_requests.items():
        hard_request_dates.setdefault(day_index, []).append({"name": name, "type": request_type})
        item = next((row for row in staff if row.name == name), None)
        if not item:
            continue
        forced_shift = _forced_carryover_shift(item, day_index)
        if forced_shift and forced_shift not in REST_COUNT_SHIFTS:
            hard_conflicts.append({
                "name": name,
                "type": request_type,
                "date": f"{month}/{day_index + 1}",
                "forcedShift": forced_shift,
                "reason": "前月夜勤引き継ぎ"
            })
    for item in staff:
        for day_index in range(min(days, 2)):
            forced_shift = _forced_carryover_shift(item, day_index)
            if forced_shift:
                carryover_dates.setdefault(day_index, []).append({"name": item.name, "shift": forced_shift})

    for day_index in range(days):
        weekday = _weekday_index(year, month, day_index) if year and month else 0
        date = f"{month}/{day_index + 1}" if month else str(day_index + 1)
        for shift in core_shifts:
            req = int(required.get(shift) or 0)
            if req <= 0:
                continue
            candidates = []
            for item in staff:
                reasons = []
                forced_shift = _forced_carryover_shift(item, day_index)
                if shift not in item.allowed_shifts:
                    reasons.append("非許可シフト")
                if weekday not in item.allowed_days:
                    reasons.append("曜日制限")
                if item.fixed_off == weekday:
                    reasons.append("固定休")
                if (item.name, day_index) in supply_exclusions:
                    reasons.append("供給除外")
                if (item.name, day_index) in hard_requests:
                    reasons.append("希望休/休暇")
                if forced_shift and forced_shift != shift:
                    reasons.append("前月引き継ぎ")
                candidates.append({
                    "name": item.name,
                    "currentShift": forced_shift or "空欄",
                    "leaveTypes": [hard_requests[(item.name, day_index)]] if (item.name, day_index) in hard_requests else [],
                    "blockedReasons": reasons
                })
            direct_count = sum(1 for item in candidates if not item["blockedReasons"])
            if direct_count < req:
                shortage_diagnostics.append({
                    "date": date,
                    "weekday": "",
                    "shift": shift,
                    "required": req,
                    "candidateCount": direct_count,
                    "topBlockedReasons": _top_reason_counts(candidates),
                    "candidates": candidates
                })

    operational_reasons = [
        {
            "date": item["date"],
            "shift": item["shift"],
            "candidateCount": item["candidateCount"],
            "topBlockedReasons": item["topBlockedReasons"]
        }
        for item in shortage_diagnostics[:20]
    ]
    for day_index, entries in sorted(hard_request_dates.items(), key=lambda item: (-len(item[1]), item[0]))[:10]:
        if len(entries) < 2:
            continue
        operational_reasons.append({
            "date": f"{month}/{day_index + 1}" if month else str(day_index + 1),
            "shift": "希望休",
            "candidateCount": max(0, len(staff) - len(entries)),
            "topBlockedReasons": [f"希望休/休暇x{len(entries)}"]
        })
    for day_index, entries in sorted(carryover_dates.items(), key=lambda item: (-len(item[1]), item[0]))[:5]:
        if len(entries) < 2:
            continue
        operational_reasons.append({
            "date": f"{month}/{day_index + 1}" if month else str(day_index + 1),
            "shift": "前月引き継ぎ",
            "candidateCount": max(0, len(staff) - len(entries)),
            "topBlockedReasons": [f"前月引き継ぎx{len(entries)}"]
        })
    manual_hints = [
        {
            "issueType": "shortage",
            "priority": "高",
            "date": item["date"],
            "shift": item["shift"],
            "targetStaff": "",
            "currentState": "必要枠未充足",
            "suggestedAction": "希望休/前月引き継ぎ/必要枠の衝突を確認",
            "candidateSummary": " / ".join(item["topBlockedReasons"]) or "候補精査要",
            "recommendedCandidatesText": "直接候補なし" if item["candidateCount"] == 0 else f"直接候補{item['candidateCount']}名",
            "redistributionCandidatesText": "再配分候補はGAS診断で確認"
        }
        for item in shortage_diagnostics[:10]
    ]
    for conflict in hard_conflicts[:10]:
        manual_hints.append({
            "issueType": "unmet_leave_request",
            "priority": "最優先",
            "date": conflict["date"],
            "shift": conflict["forcedShift"],
            "targetStaff": conflict["name"],
            "currentState": f"{conflict['name']} は {conflict['reason']} で {conflict['forcedShift']} 固定",
            "suggestedAction": "希望休を維持するため、前月末夜勤または当月必要枠を再調整",
            "candidateSummary": conflict["type"],
            "recommendedCandidatesText": "直接候補なし",
            "redistributionCandidatesText": "前月末夜勤の再配分を確認"
        })
    for day_index, entries in sorted(hard_request_dates.items(), key=lambda item: (-len(item[1]), item[0]))[:5]:
        if len(entries) < 2:
            continue
        date = f"{month}/{day_index + 1}" if month else str(day_index + 1)
        manual_hints.append({
            "issueType": "hard_request_cluster",
            "priority": "最優先",
            "date": date,
            "shift": "希望休",
            "targetStaff": "、".join(entry["name"] for entry in entries[:5]),
            "currentState": f"同日に希望休/休暇が{len(entries)}件",
            "suggestedAction": "希望休は維持し、前後日の夜勤配置または必要枠を調整",
            "candidateSummary": "希望休集中",
            "recommendedCandidatesText": "休暇者以外を確認",
            "redistributionCandidatesText": "前後日の夜勤ブロックを確認"
        })
    for day_index, entries in sorted(carryover_dates.items(), key=lambda item: (-len(item[1]), item[0]))[:3]:
        if len(entries) < 2:
            continue
        date = f"{month}/{day_index + 1}" if month else str(day_index + 1)
        manual_hints.append({
            "issueType": "previous_month_carryover_pressure",
            "priority": "高",
            "date": date,
            "shift": "前月引き継ぎ",
            "targetStaff": "、".join(entry["name"] for entry in entries[:5]),
            "currentState": f"前月夜勤引き継ぎが{len(entries)}件",
            "suggestedAction": "前月末の夜勤者または月初必要枠を再確認",
            "candidateSummary": "前月引き継ぎ集中",
            "recommendedCandidatesText": "前月末夜勤者を確認",
            "redistributionCandidatesText": "前月末夜勤の再配分を確認"
        })

    return {
        "shortageDiagnostics": shortage_diagnostics,
        "deploymentReadiness": {
            "isProductionSafe": False,
            "constraintSafety": "unsafe",
            "operationalReadiness": "blocked",
            "blockers": ["solver_infeasible"],
            "advisories": ["infeasible_diagnostics"],
            "hardViolationCount": len(hard_conflicts),
            "shortageCount": len(shortage_diagnostics),
            "blockingShortageCount": len(shortage_diagnostics),
            "toleratedShortageCount": 0,
            "unmetLeaveRequestCount": len(hard_conflicts),
            "unmetShiftRequestCount": 0,
            "operationalShortageReasons": operational_reasons,
            "decisionCategory": "solver_infeasible"
        },
        "manualCorrectionHints": manual_hints,
        "infeasibleConflicts": hard_conflicts
    }


def _is_work_shift(shift: str) -> bool:
    return shift in WORK_SHIFTS


def _is_consecutive_work_shift(shift: str) -> bool:
    return shift in CONSECUTIVE_WORK_SHIFTS


def _is_rest_count_shift(shift: str) -> bool:
    return shift in REST_COUNT_SHIFTS


def _combined_shift_at(item: Staff, solved_shifts: List[str], day_index: int) -> str:
    if day_index >= 0:
        return solved_shifts[day_index] if day_index < len(solved_shifts) else ""
    tail_index = len(item.previous_tail) + day_index
    return item.previous_tail[tail_index] if tail_index >= 0 else ""


def _span_label(start: int, end: int) -> str:
    def one(index: int) -> str:
        return f"前月末{abs(index)}日前" if index < 0 else f"{index + 1}日"

    return f"{one(start)}-{one(end)}"


def _build_naturalness_report(staff: List[Staff], solved_by_name: Dict[str, List[str]], days: int) -> dict:
    report = {
        "fiveConsecutiveWork": {"count": 0, "samples": []},
        "fourConsecutiveWork": {"count": 0, "samples": []},
        "sameShiftRun": {"count": 0, "samples": []},
        "isolatedWorkday": {"count": 0, "samples": []},
        "isolatedPublicHoliday": {"count": 0, "samples": []},
        "lateToRest": {"count": 0, "samples": []},
        "postRestEarly": {"count": 0, "samples": []},
        "tightNightBlock": {"count": 0, "samples": []},
        "shortNightBlockGap": {"count": 0, "samples": []},
        "recoveryToNight": {"count": 0, "samples": []},
        "lateToNight": {"count": 0, "samples": []},
        "lateToEarly": {"count": 0, "samples": []},
        "previousMonthBoundaryChecks": {"count": 0, "samples": []},
    }

    def add(key: str, item: Staff, start: int, end: int, detail: str):
        bucket = report[key]
        bucket["count"] += 1
        if len(bucket["samples"]) < 20:
            bucket["samples"].append({
                "name": item.name,
                "span": _span_label(start, end),
                "detail": detail,
            })

    for item in staff:
        shifts = solved_by_name.get(item.name) or []
        first_index = -min(7, len(item.previous_tail))

        for start in range(first_index, days - 4):
            if start + 4 < 0:
                continue
            window = [_combined_shift_at(item, shifts, start + offset) for offset in range(5)]
            if any(start + offset >= days for offset in range(5)):
                continue
            if all(_is_consecutive_work_shift(shift) for shift in window):
                add("fiveConsecutiveWork", item, start, start + 4, "".join(window))

        for start in range(first_index, days - 3):
            if start + 3 < 0:
                continue
            window = [_combined_shift_at(item, shifts, start + offset) for offset in range(4)]
            if any(start + offset >= days for offset in range(4)):
                continue
            if all(_is_consecutive_work_shift(shift) for shift in window):
                add("fourConsecutiveWork", item, start, start + 3, "".join(window))

        for start in range(first_index, days - 2):
            if start + 2 < 0:
                continue
            window = [_combined_shift_at(item, shifts, start + offset) for offset in range(3)]
            if window[0] in ["早", "遅"] and window[0] == window[1] == window[2]:
                add("sameShiftRun", item, start, start + 2, window[0] * 3)

        for start in range(first_index, days - 3):
            if start + 3 < 0:
                continue
            window = [_combined_shift_at(item, shifts, start + offset) for offset in range(4)]
            if window == ["夜", "明", "公", "夜"] or window == ["夜", "明", URGENT_REST_SHIFT, "夜"]:
                add("tightNightBlock", item, start, start + 3, "夜明公夜")

        night_days = [day for day in range(first_index, days) if _combined_shift_at(item, shifts, day) == "夜"]
        for left, right in zip(night_days, night_days[1:]):
            if 1 <= right - left <= 4:
                add("shortNightBlockGap", item, left, right, f"夜勤間隔{right - left}日")

        for day in range(first_index + 1, days - 1):
            if day + 1 < 0:
                continue
            prev_shift = _combined_shift_at(item, shifts, day - 1)
            shift = _combined_shift_at(item, shifts, day)
            next_shift = _combined_shift_at(item, shifts, day + 1)
            if _is_rest_count_shift(prev_shift) and _is_consecutive_work_shift(shift) and _is_rest_count_shift(next_shift):
                add("isolatedWorkday", item, day - 1, day + 1, f"公-{shift}-公")
            if _is_consecutive_work_shift(prev_shift) and _is_rest_count_shift(shift) and _is_consecutive_work_shift(next_shift):
                add("isolatedPublicHoliday", item, day - 1, day + 1, f"{prev_shift}-公-{next_shift}")

        for day in range(first_index + 1, days):
            if day < 0:
                continue
            prev_shift = _combined_shift_at(item, shifts, day - 1)
            shift = _combined_shift_at(item, shifts, day)
            if _is_rest_count_shift(prev_shift) and shift == "早":
                add("postRestEarly", item, day - 1, day, "公→早")
            if prev_shift == "遅" and _is_rest_count_shift(shift):
                add("lateToRest", item, day - 1, day, "遅→公")
            if prev_shift == "明" and shift == "夜":
                add("recoveryToNight", item, day - 1, day, "明→夜")
            if prev_shift == "遅" and shift == "夜":
                add("lateToNight", item, day - 1, day, "遅→夜")
            if prev_shift == "遅" and shift == "早":
                add("lateToEarly", item, day - 1, day, "遅→早")

        if item.previous_tail:
            boundary = [_combined_shift_at(item, shifts, day) for day in range(-3, min(3, days))]
            add("previousMonthBoundaryChecks", item, -3, min(2, days - 1), " / ".join(boundary))

    return report


def _current_schedule_rows(payload: dict) -> Dict[str, dict]:
    return {row.get("name"): row for row in payload.get("currentSchedule") or [] if row.get("name")}


def _normalize_shift_label(value: str) -> str:
    shift = str(value or "").strip()
    return shift if shift in ASSIGNABLE_SHIFTS or shift == "" else ""


def _build_recovery_settings(payload: dict) -> dict:
    recovery = payload.get("recovery") or {}
    fixed_through_day = int(recovery.get("fixedThroughDay") or recovery.get("confirmedThroughDay") or 0)
    fixed_day_indexes = {
        int(item)
        for item in recovery.get("fixedDayIndexes") or []
        if str(item).lstrip("-").isdigit()
    }
    for value in recovery.get("fixedDates") or []:
        day = _parse_date_day(value)
        if day > 0:
            fixed_day_indexes.add(day - 1)

    urgent_leave_by_name_day = {}
    for entry in recovery.get("urgentLeaves") or []:
        name = str(entry.get("name") or "").strip()
        day = _parse_date_day(entry.get("date"))
        if name and day > 0:
            urgent_leave_by_name_day[(name, day - 1)] = entry

    return {
        "enabled": bool(recovery.get("enabled") or recovery.get("urgentLeaves") or fixed_through_day or fixed_day_indexes),
        "fixedThroughDay": max(0, fixed_through_day),
        "fixedDayIndexes": fixed_day_indexes,
        "urgentLeaveByNameDay": urgent_leave_by_name_day,
        "changePenalty": int(recovery.get("changePenalty") or 120000),
        "changedWorkPenalty": int(recovery.get("changedWorkPenalty") or 180000),
    }


def _is_fixed_recovery_day(recovery_settings: dict, day_index: int) -> bool:
    return day_index < recovery_settings["fixedThroughDay"] or day_index in recovery_settings["fixedDayIndexes"]


def _build_recovery_diffs(payload: dict, recovery_settings: dict, solved_by_name: Dict[str, List[str]], days: int) -> List[dict]:
    if not recovery_settings["enabled"]:
        return []
    current_rows = _current_schedule_rows(payload)
    urgent = recovery_settings["urgentLeaveByNameDay"]
    required_staffing = payload.get("requiredShiftStaffing") or {}
    required_by_shift = {shift: int(required_staffing.get(shift) or 0) for shift in ("早", "日", "遅", "夜")}
    before_coverage = [{shift: 0 for shift in required_by_shift} for _ in range(days)]
    after_coverage = [{shift: 0 for shift in required_by_shift} for _ in range(days)]
    for row in current_rows.values():
        shifts = list(row.get("shifts") or [])[:days]
        for d in range(days):
            shift = _normalize_shift_label(shifts[d] if d < len(shifts) else "")
            if shift in before_coverage[d]:
                before_coverage[d][shift] += 1
    for shifts in solved_by_name.values():
        for d in range(min(days, len(shifts))):
            shift = _normalize_shift_label(shifts[d])
            if shift in after_coverage[d]:
                after_coverage[d][shift] += 1
    diffs = []
    for name, row in current_rows.items():
        before_shifts = list(row.get("shifts") or [])[:days]
        after_shifts = solved_by_name.get(name) or []
        for d in range(days):
            before = _normalize_shift_label(before_shifts[d] if d < len(before_shifts) else "")
            after = _normalize_shift_label(after_shifts[d] if d < len(after_shifts) else "")
            if before == after and (name, d) not in urgent:
                continue
            labels = []
            if (name, d) in urgent:
                labels.append("急休反映")
                if after == URGENT_REST_SHIFT:
                    labels.append("休振替")
                elif after == ABSENCE_SHIFT:
                    labels.append("欠勤候補")
            elif before == "夜" or after == "夜":
                labels.append("夜勤再配置")
            elif before == "明" or after == "明":
                labels.append("明け確保")
            elif after in REST_COUNT_SHIFTS:
                labels.append("公休確保")
            elif (
                after in required_by_shift
                and required_by_shift[after] > 0
                and before_coverage[d][after] < required_by_shift[after]
                and after_coverage[d][after] >= required_by_shift[after]
            ):
                labels.append("欠員補填")
            elif before == "公" and _is_consecutive_work_shift(after):
                labels.append("公休調整")
            elif _is_consecutive_work_shift(after) and not _is_consecutive_work_shift(before):
                labels.append("勤務調整")
            if not labels:
                labels.append("最小変更")
            diffs.append({
                "date": f"{payload.get('targetMonth')}/{d + 1}",
                "day": d + 1,
                "name": name,
                "before": "" if before == BLANK_SHIFT else before,
                "after": "" if after == BLANK_SHIFT else after,
                "labels": labels[:2],
                "fixed": _is_fixed_recovery_day(recovery_settings, d),
            })
    return diffs


def _day_work_swap_score(item: Staff, shifts: List[str], days: int) -> int:
    score = 0
    first_index = -min(7, len(item.previous_tail))
    for start in range(first_index, days - 2):
        if start + 2 < 0:
            continue
        window = [_combined_shift_at(item, shifts, start + offset) for offset in range(3)]
        if window[0] in ["早", "遅"] and window[0] == window[1] == window[2]:
            score += WEIGHT_SAME_SHIFT_RUN
    for day in range(first_index + 1, days):
        if day < 0:
            continue
        prev_shift = _combined_shift_at(item, shifts, day - 1)
        shift = _combined_shift_at(item, shifts, day)
        if _is_rest_count_shift(prev_shift) and shift == "早":
            score += WEIGHT_POST_REST_EARLY
        if prev_shift == "遅" and _is_rest_count_shift(shift):
            score += WEIGHT_LATE_TO_REST
        if prev_shift == "遅" and shift == "夜":
            score += WEIGHT_LATE_TO_NIGHT
    return score


def _has_late_to_early_edge(item: Staff, shifts: List[str], day: int, days: int) -> bool:
    for left in [day - 1, day]:
        right = left + 1
        if left < -len(item.previous_tail) or right < 0 or right >= days:
            continue
        if _combined_shift_at(item, shifts, left) == "遅" and _combined_shift_at(item, shifts, right) == "早":
            return True
    return False


def _can_swap_day_work_shift(
    item: Staff,
    day: int,
    new_shift: str,
    year: int,
    month: int,
    requests: Dict[Tuple[str, int], Tuple[str, bool]],
    supply_exclusions: Dict[Tuple[str, int], dict],
    recovery_settings: dict,
) -> bool:
    if new_shift not in ["早", "日", "遅"]:
        return False
    if new_shift not in item.allowed_shifts:
        return False
    weekday = _weekday_index(year, month, day)
    if weekday not in item.allowed_days or item.fixed_off == weekday:
        return False
    if (item.name, day) in requests or (item.name, day) in supply_exclusions:
        return False
    if recovery_settings.get("urgentLeaveByNameDay", {}).get((item.name, day)):
        return False
    if recovery_settings.get("enabled") and _is_fixed_recovery_day(recovery_settings, day):
        return False
    return True


def _improve_day_work_naturalness_by_safe_swaps(
    staff: List[Staff],
    solved_by_name: Dict[str, List[str]],
    year: int,
    month: int,
    days: int,
    requests: Dict[Tuple[str, int], Tuple[str, bool]],
    supply_exclusions: Dict[Tuple[str, int], dict],
    recovery_settings: dict,
) -> dict:
    day_work_shifts = {"早", "日", "遅"}
    swaps = []
    by_name = {item.name: item for item in staff}
    names = [item.name for item in staff if item.name in solved_by_name]
    max_swaps = 200

    for _ in range(4):
        best = None
        for day in range(days):
            for left_index, left_name in enumerate(names):
                left_item = by_name[left_name]
                left_shifts = solved_by_name[left_name]
                left_shift = left_shifts[day] if day < len(left_shifts) else ""
                if left_shift not in day_work_shifts:
                    continue
                for right_name in names[left_index + 1:]:
                    right_item = by_name[right_name]
                    right_shifts = solved_by_name[right_name]
                    right_shift = right_shifts[day] if day < len(right_shifts) else ""
                    if right_shift not in day_work_shifts or right_shift == left_shift:
                        continue
                    if not _can_swap_day_work_shift(left_item, day, right_shift, year, month, requests, supply_exclusions, recovery_settings):
                        continue
                    if not _can_swap_day_work_shift(right_item, day, left_shift, year, month, requests, supply_exclusions, recovery_settings):
                        continue

                    left_candidate = list(left_shifts)
                    right_candidate = list(right_shifts)
                    left_candidate[day], right_candidate[day] = right_shift, left_shift
                    if _has_late_to_early_edge(left_item, left_candidate, day, days):
                        continue
                    if _has_late_to_early_edge(right_item, right_candidate, day, days):
                        continue

                    before = (
                        _day_work_swap_score(left_item, left_shifts, days)
                        + _day_work_swap_score(right_item, right_shifts, days)
                    )
                    after = (
                        _day_work_swap_score(left_item, left_candidate, days)
                        + _day_work_swap_score(right_item, right_candidate, days)
                    )
                    improvement = before - after
                    if improvement <= 0:
                        continue
                    if not best or improvement > best["improvement"]:
                        best = {
                            "day": day,
                            "leftName": left_name,
                            "rightName": right_name,
                            "leftBefore": left_shift,
                            "rightBefore": right_shift,
                            "leftAfter": right_shift,
                            "rightAfter": left_shift,
                            "improvement": improvement,
                            "leftCandidate": left_candidate,
                            "rightCandidate": right_candidate,
                        }
        if not best:
            break
        solved_by_name[best["leftName"]] = best["leftCandidate"]
        solved_by_name[best["rightName"]] = best["rightCandidate"]
        swaps.append({
            "day": best["day"] + 1,
            "leftName": best["leftName"],
            "rightName": best["rightName"],
            "leftBefore": best["leftBefore"],
            "rightBefore": best["rightBefore"],
            "leftAfter": best["leftAfter"],
            "rightAfter": best["rightAfter"],
            "improvement": best["improvement"],
        })
        if len(swaps) >= max_swaps:
            break
    return {"dayWorkSwapCount": len(swaps), "dayWorkSwaps": swaps[:30]}


def solve_shift_schedule(payload: dict, time_limit_seconds: float = 120.0):
    year = int(payload["targetYear"])
    month = int(payload["targetMonth"])
    days = int(payload["daysInMonth"])
    required = payload.get("requiredShiftStaffing") or {"早": 1, "日": 0, "遅": 1, "夜": 1}
    allowed_shortage = set(((payload.get("allowedShortagePolicy") or {}).get("allowedShortageShifts")) or ["遅"])
    female_required_weekdays = {int(item) for item in payload.get("femaleRequiredWeekdays") or []}
    experiment = payload.get("experiment") or {}
    force_no_allowed_shortage = set(experiment.get("forceNoShortageShifts") or [])
    force_no_four_consecutive = bool(experiment.get("forceNoFourConsecutiveWork"))
    staff = _load_staff(payload)
    recovery_settings = _build_recovery_settings(payload)
    flexible_night_targets = _build_flexible_night_targets(
        staff,
        days * int(required.get("夜") or 0),
    )
    current_rows = _current_schedule_rows(payload)
    requests = _build_requests(payload)
    supply_exclusions = _build_supply_exclusions(payload)
    eligible_counts = _build_shift_eligible_counts(staff, year, month, days)
    eligible_counts_by_day = _build_shift_eligible_counts_by_day(
        staff,
        year,
        month,
        days,
        supply_exclusions,
        requests,
    )
    night_density_profiles = {}
    for s, item in enumerate(staff):
        target = _night_target(item.condition)
        if target is None:
            target = flexible_night_targets.get(s)
        if target is not None and "夜" in item.allowed_shifts:
            excluded_days = sum(1 for d in range(days) if (item.name, d) in supply_exclusions)
            night_density_profiles[s] = _night_density_profile(target, max(0, days - excluded_days))
    naturalness_weight_profiles = {
        s: _naturalness_weight_profile(
            item,
            required,
            eligible_counts,
            night_density_profiles.get(s) or {},
        )
        for s, item in enumerate(staff)
    }
    unmet_request_terms = []
    forced_single_shift_terms = []
    change_terms = []
    changed_work_terms = []
    urgent_absence_terms = []

    model = cp_model.CpModel()
    x = {}
    for s, item in enumerate(staff):
        current_shifts = list((current_rows.get(item.name) or {}).get("shifts") or [])
        for d in range(days):
            vars_for_day = []
            for shift in ASSIGNABLE_SHIFTS:
                var = model.NewBoolVar(f"x_{s}_{d}_{shift}")
                x[s, d, shift] = var
                vars_for_day.append(var)
            model.AddExactlyOne(vars_for_day)

            weekday = _weekday_index(year, month, d)
            if item.fixed_off == weekday:
                for shift in WORK_SHIFTS:
                    model.Add(x[s, d, shift] == 0)
            if weekday not in item.allowed_days:
                for shift in ["早", "日", "遅", "夜"]:
                    model.Add(x[s, d, shift] == 0)
            for shift in ["早", "日", "遅", "夜"]:
                if shift not in item.allowed_shifts:
                    model.Add(x[s, d, shift] == 0)

            urgent_leave = recovery_settings["urgentLeaveByNameDay"].get((item.name, d))
            supply_exclusion = supply_exclusions.get((item.name, d))
            current_shift = _normalize_shift_label(current_shifts[d] if d < len(current_shifts) else "")
            current_request = requests.get((item.name, d))
            if supply_exclusion:
                excluded_shift = SUPPLY_EXCLUSION_TO_SHIFT.get(str(supply_exclusion.get("type") or ""), SUPPLY_EXCLUDED_SHIFT)
                model.Add(x[s, d, excluded_shift] == 1)
                for shift in ASSIGNABLE_SHIFTS:
                    if shift != excluded_shift:
                        model.Add(x[s, d, shift] == 0)
            elif urgent_leave:
                if current_shift in REST_COUNT_SHIFTS or (current_request and current_request[1]):
                    model.Add(x[s, d, URGENT_REST_SHIFT] == 1)
                    model.Add(x[s, d, ABSENCE_SHIFT] == 0)
                else:
                    model.Add(x[s, d, URGENT_REST_SHIFT] + x[s, d, ABSENCE_SHIFT] == 1)
                for shift in ["早", "日", "遅", "夜", "明", "公", BLANK_SHIFT]:
                    model.Add(x[s, d, shift] == 0)
                urgent_absence_terms.append(x[s, d, ABSENCE_SHIFT])
            elif recovery_settings["enabled"] and _is_fixed_recovery_day(recovery_settings, d) and current_shift:
                fixed_shift = BLANK_SHIFT if current_shift == "" else current_shift
                if fixed_shift in ASSIGNABLE_SHIFTS:
                    model.Add(x[s, d, fixed_shift] == 1)
            else:
                model.Add(x[s, d, URGENT_REST_SHIFT] == 0)
                model.Add(x[s, d, ABSENCE_SHIFT] == 0)
                for shift in SUPPLY_EXCLUDED_SHIFTS:
                    model.Add(x[s, d, shift] == 0)

            requested = None if urgent_leave or supply_exclusion else current_request
            if requested:
                requested_shift, is_hard_leave = requested
                if is_hard_leave:
                    model.Add(x[s, d, requested_shift] == 1)
                else:
                    unmet = model.NewBoolVar(f"unmet_request_{s}_{d}_{requested_shift}")
                    model.Add(x[s, d, requested_shift] == 0).OnlyEnforceIf(unmet)
                    model.Add(x[s, d, requested_shift] == 1).OnlyEnforceIf(unmet.Not())
                    unmet_request_terms.append(unmet)
            elif (
                len(item.allowed_shifts) == 1
                and item.allowed_shifts[0] in ["早", "日", "遅"]
                and weekday in item.allowed_days
                and item.fixed_off != weekday
                and not _is_blank_allowed_staff(item)
            ):
                missed_single = model.NewBoolVar(f"missed_single_shift_{s}_{d}")
                model.Add(x[s, d, item.allowed_shifts[0]] == 0).OnlyEnforceIf(missed_single)
                model.Add(x[s, d, item.allowed_shifts[0]] == 1).OnlyEnforceIf(missed_single.Not())
                forced_single_shift_terms.append(missed_single)

            if recovery_settings["enabled"] and not supply_exclusion and not _is_fixed_recovery_day(recovery_settings, d):
                comparable_shift = BLANK_SHIFT if current_shift == "" else current_shift
                if comparable_shift in ASSIGNABLE_SHIFTS:
                    changed = model.NewBoolVar(f"changed_from_current_{s}_{d}")
                    model.Add(x[s, d, comparable_shift] == 0).OnlyEnforceIf(changed)
                    model.Add(x[s, d, comparable_shift] == 1).OnlyEnforceIf(changed.Not())
                    change_terms.append(changed)
                    if comparable_shift in WORK_SHIFTS:
                        changed_work_terms.append(changed)

        # Previous-month carryover.
        last_previous_shift = item.previous_tail[-1] if item.previous_tail else ""
        if last_previous_shift == "夜":
            model.Add(x[s, 0, "明"] == 1)
            if days > 1:
                model.Add(x[s, 1, "公"] == 1)
        else:
            model.Add(x[s, 0, "明"] == 0)
        if last_previous_shift == "明":
            model.Add(x[s, 0, "公"] == 1)
        elif last_previous_shift == "遅" and days > 0:
            model.Add(x[s, 0, "早"] == 0)

        for d in range(days):
            if d + 1 < days:
                model.Add(x[s, d, "夜"] == x[s, d + 1, "明"])
                model.Add(x[s, d, "遅"] + x[s, d + 1, "早"] <= 1)
            if d > 0:
                model.Add(x[s, d, "明"] == x[s, d - 1, "夜"])
            if d + 2 < days:
                model.Add(x[s, d, "夜"] <= sum(x[s, d + 2, shift] for shift in REST_COUNT_SHIFTS))

        tail_len = min(7, len(item.previous_tail))
        for start in range(-tail_len, max(0, days - 4)):
            previous_work_count = 0
            current_work_terms = []
            includes_current_month = False
            for offset in range(5):
                day_index = start + offset
                if day_index < 0:
                    if _is_consecutive_work_shift(item.previous_tail[len(item.previous_tail) + day_index]):
                        previous_work_count += 1
                elif day_index < days:
                    includes_current_month = True
                    current_work_terms.extend(x[s, day_index, shift] for shift in CONSECUTIVE_WORK_SHIFTS)
            if includes_current_month:
                model.Add(previous_work_count + sum(current_work_terms) <= 4)

        for week_start in range(0, days, 7):
            week_days = range(week_start, min(days, week_start + 7))
            model.Add(sum(x[s, d, shift] for d in week_days for shift in WORK_SHIFTS) <= 5)

        is_night_only = _is_night_only_staff(item)
        is_blank_allowed = _is_blank_allowed_staff(item)
        is_rest_target_exempt = _is_rest_target_exempt(item)
        if not is_blank_allowed:
            for d in range(days):
                if (item.name, d) not in supply_exclusions:
                    model.Add(x[s, d, BLANK_SHIFT] == 0)
        else:
            for d in range(days):
                if d == 0:
                    if last_previous_shift != "明":
                        model.Add(x[s, d, "公"] == 0)
                        model.Add(x[s, d, URGENT_REST_SHIFT] == 0)
                else:
                    model.Add(x[s, d, "公"] + x[s, d, URGENT_REST_SHIFT] <= x[s, d - 1, "明"])
        if not is_night_only:
            model.Add(sum(x[s, d, shift] for d in range(days) for shift in WORK_SHIFTS) <= _monthly_work_limit(days))
        if not is_rest_target_exempt:
            excluded_days = sum(1 for d in range(days) if (item.name, d) in supply_exclusions)
            adjusted_rest_target = max(0, _public_holiday_target(days) - excluded_days)
            model.Add(sum(x[s, d, shift] for d in range(days) for shift in REST_COUNT_SHIFTS) == adjusted_rest_target)

        target = _night_target(item.condition)
        if target is not None and "夜" in item.allowed_shifts:
            model.Add(sum(x[s, d, "夜"] for d in range(days)) == target)

    shortage_vars = []
    for d in range(days):
        for shift in ["早", "遅", "夜"]:
            req = int(required.get(shift) or 0)
            if req <= 0:
                continue
            coverage = sum(x[s, d, shift] for s in range(len(staff)))
            if shift in allowed_shortage and shift not in force_no_allowed_shortage:
                shortage = model.NewIntVar(0, req, f"shortage_{d}_{shift}")
                model.Add(coverage + shortage >= req)
                shortage_vars.append((shift, shortage))
            else:
                model.Add(coverage >= req)

    # Prefer covering optional day shifts when configured.
    optional_day_shortages = []
    for d in range(days):
        req = int(required.get("日") or 0)
        if req > 0:
            coverage = sum(x[s, d, "日"] for s in range(len(staff)))
            shortage = model.NewIntVar(0, req, f"day_shortage_{d}")
            model.Add(coverage + shortage >= req)
            optional_day_shortages.append(shortage)

    if female_required_weekdays:
        for d in range(days):
            if _weekday_index(year, month, d) not in female_required_weekdays:
                continue
            female_day_staffing = [
                x[s, d, shift]
                for s, item in enumerate(staff)
                if item.gender.strip() == "女性"
                for shift in ["早", "日", "遅"]
            ]
            if female_day_staffing:
                model.Add(sum(female_day_staffing) >= 1)
            else:
                model.AddBoolOr([])

    fairness_terms = []
    shift_counts = {}
    work_counts = {}
    for shift in ["早", "遅", "夜"]:
        counts = []
        for s in range(len(staff)):
            count = model.NewIntVar(0, days, f"count_{s}_{shift}")
            model.Add(count == sum(x[s, d, shift] for d in range(days)))
            shift_counts[s, shift] = count
            item = staff[s]
            if (
                shift in item.allowed_shifts
                and not _is_rest_target_exempt(item)
                and not (shift == "夜" and _night_target(item.condition) is not None)
            ):
                counts.append(count)
        if counts:
            max_count = model.NewIntVar(0, days, f"max_{shift}")
            min_count = model.NewIntVar(0, days, f"min_{shift}")
            model.AddMaxEquality(max_count, counts)
            model.AddMinEquality(min_count, counts)
            gap = model.NewIntVar(0, days, f"gap_{shift}")
            model.Add(gap == max_count - min_count)
            fairness_terms.append(gap)

    active_work_counts = []
    for s, item in enumerate(staff):
        count = model.NewIntVar(0, days, f"work_count_{s}")
        model.Add(count == sum(x[s, d, shift] for d in range(days) for shift in WORK_SHIFTS))
        work_counts[s] = count
        if not _is_rest_target_exempt(item):
            active_work_counts.append(count)

    work_count_fairness_terms = []
    if active_work_counts:
        max_work_count = model.NewIntVar(0, days, "max_active_work_count")
        min_work_count = model.NewIntVar(0, days, "min_active_work_count")
        model.AddMaxEquality(max_work_count, active_work_counts)
        model.AddMinEquality(min_work_count, active_work_counts)
        work_gap = model.NewIntVar(0, days, "active_work_count_gap")
        model.Add(work_gap == max_work_count - min_work_count)
        work_count_fairness_terms.append(work_gap)

    weekend_rest_fairness_terms = []
    weekend_public_holiday_counts = []
    for s, item in enumerate(staff):
        if _is_rest_target_exempt(item):
            continue
        count = model.NewIntVar(0, days, f"weekend_public_holiday_count_{s}")
        model.Add(count == sum(
            x[s, d, shift]
            for d in range(days)
            for shift in REST_COUNT_SHIFTS
            if _weekday_index(year, month, d) in [0, 6]
        ))
        weekend_public_holiday_counts.append(count)
    if weekend_public_holiday_counts:
        max_weekend_rest = model.NewIntVar(0, days, "max_weekend_public_holiday_count")
        min_weekend_rest = model.NewIntVar(0, days, "min_weekend_public_holiday_count")
        model.AddMaxEquality(max_weekend_rest, weekend_public_holiday_counts)
        model.AddMinEquality(min_weekend_rest, weekend_public_holiday_counts)
        weekend_gap = model.NewIntVar(0, days, "weekend_public_holiday_gap")
        model.Add(weekend_gap == max_weekend_rest - min_weekend_rest)
        weekend_rest_fairness_terms.append(weekend_gap)

    flexible_night_target_terms = []
    for s, target in flexible_night_targets.items():
        count = shift_counts[s, "夜"]
        diff = model.NewIntVar(0, days, f"flex_night_target_diff_{s}")
        model.AddAbsEquality(diff, count - target)
        flexible_night_target_terms.append(diff)

    four_day_terms = []
    same_shift_run_terms = []
    isolated_workday_terms = []
    isolated_public_holiday_terms = []
    late_to_rest_terms = []
    post_rest_early_terms = []
    tight_night_block_terms = []
    short_night_gap_terms = []
    recovery_to_night_terms = []
    late_to_night_terms = []
    month_end_work_pressure_terms = []
    cross_boundary_four_day_terms = []
    for s in range(len(staff)):
        item = staff[s]
        tail_len = min(7, len(item.previous_tail))
        night_density = night_density_profiles.get(s) or {}
        naturalness_weights = naturalness_weight_profiles.get(s) or {}
        tight_night_weight = int(night_density.get("tightNightBlockWeight") or 100000)
        short_night_gap_weight = int(night_density.get("shortNightGapWeight") or 3000)
        for start in range(-tail_len, 0):
            previous_work_count = 0
            current_work_terms = []
            valid_window = True
            for offset in range(4):
                day_index = start + offset
                if day_index < 0:
                    tail_index = len(item.previous_tail) + day_index
                    if tail_index < 0:
                        valid_window = False
                        break
                    if _is_consecutive_work_shift(item.previous_tail[tail_index]):
                        previous_work_count += 1
                elif day_index < days:
                    current_work_terms.extend(x[s, day_index, shift] for shift in CONSECUTIVE_WORK_SHIFTS)
                else:
                    valid_window = False
                    break
            if not valid_window or not current_work_terms:
                continue
            if force_no_four_consecutive:
                model.Add(previous_work_count + sum(current_work_terms) <= 3)
            else:
                term = model.NewBoolVar(f"cross_boundary_four_run_{s}_{start}")
                model.Add(previous_work_count + sum(current_work_terms) == 4).OnlyEnforceIf(term)
                model.Add(previous_work_count + sum(current_work_terms) != 4).OnlyEnforceIf(term.Not())
                cross_boundary_four_day_terms.append(term)

        for d in range(max(0, days - 3)):
            term = model.NewBoolVar(f"four_run_{s}_{d}")
            four_work_count = sum(x[s, d + offset, shift] for offset in range(4) for shift in CONSECUTIVE_WORK_SHIFTS)
            if force_no_four_consecutive:
                model.Add(four_work_count <= 3)
            else:
                model.Add(four_work_count == 4).OnlyEnforceIf(term)
                model.Add(four_work_count != 4).OnlyEnforceIf(term.Not())
                four_day_terms.append(term)

        for d in range(max(0, days - 2)):
            for shift in ["早", "遅"]:
                term = model.NewBoolVar(f"same_{shift}_run3_{s}_{d}")
                model.Add(sum(x[s, d + offset, shift] for offset in range(3)) == 3).OnlyEnforceIf(term)
                model.Add(sum(x[s, d + offset, shift] for offset in range(3)) != 3).OnlyEnforceIf(term.Not())
                same_shift_run_terms.append((term, int(naturalness_weights.get("sameShiftRun") or 0)))

        for d in range(1, max(1, days - 1)):
            middle_work = model.NewBoolVar(f"work_day_{s}_{d}")
            prev_work = model.NewBoolVar(f"work_day_{s}_{d - 1}")
            next_work = model.NewBoolVar(f"work_day_{s}_{d + 1}")
            model.Add(middle_work == sum(x[s, d, shift] for shift in CONSECUTIVE_WORK_SHIFTS))
            model.Add(prev_work == sum(x[s, d - 1, shift] for shift in CONSECUTIVE_WORK_SHIFTS))
            model.Add(next_work == sum(x[s, d + 1, shift] for shift in CONSECUTIVE_WORK_SHIFTS))

            isolated_work = model.NewBoolVar(f"isolated_workday_{s}_{d}")
            prev_rest = model.NewBoolVar(f"prev_rest_day_{s}_{d}")
            next_rest = model.NewBoolVar(f"next_rest_day_{s}_{d}")
            model.Add(sum(x[s, d - 1, shift] for shift in REST_COUNT_SHIFTS) == 1).OnlyEnforceIf(prev_rest)
            model.Add(sum(x[s, d - 1, shift] for shift in REST_COUNT_SHIFTS) == 0).OnlyEnforceIf(prev_rest.Not())
            model.Add(sum(x[s, d + 1, shift] for shift in REST_COUNT_SHIFTS) == 1).OnlyEnforceIf(next_rest)
            model.Add(sum(x[s, d + 1, shift] for shift in REST_COUNT_SHIFTS) == 0).OnlyEnforceIf(next_rest.Not())
            model.AddBoolAnd([middle_work, prev_rest, next_rest]).OnlyEnforceIf(isolated_work)
            model.AddBoolOr([middle_work.Not(), prev_rest.Not(), next_rest.Not()]).OnlyEnforceIf(isolated_work.Not())
            isolated_workday_terms.append((isolated_work, int(naturalness_weights.get("isolatedWorkday") or 0)))

            isolated_public_holiday = model.NewBoolVar(f"isolated_public_holiday_{s}_{d}")
            current_rest = model.NewBoolVar(f"current_rest_day_{s}_{d}")
            model.Add(sum(x[s, d, shift] for shift in REST_COUNT_SHIFTS) == 1).OnlyEnforceIf(current_rest)
            model.Add(sum(x[s, d, shift] for shift in REST_COUNT_SHIFTS) == 0).OnlyEnforceIf(current_rest.Not())
            model.AddBoolAnd([prev_work, current_rest, next_work]).OnlyEnforceIf(isolated_public_holiday)
            model.AddBoolOr([prev_work.Not(), current_rest.Not(), next_work.Not()]).OnlyEnforceIf(isolated_public_holiday.Not())
            isolated_public_holiday_terms.append((isolated_public_holiday, int(naturalness_weights.get("isolatedPublicHoliday") or 0)))

        for d in range(1, days):
            late_to_rest = model.NewBoolVar(f"late_to_rest_{s}_{d}")
            model.Add(x[s, d - 1, "遅"] + sum(x[s, d, shift] for shift in REST_COUNT_SHIFTS) == 2).OnlyEnforceIf(late_to_rest)
            model.Add(x[s, d - 1, "遅"] + sum(x[s, d, shift] for shift in REST_COUNT_SHIFTS) != 2).OnlyEnforceIf(late_to_rest.Not())
            late_to_rest_terms.append((late_to_rest, int(naturalness_weights.get("lateToRest") or 0)))

            term = model.NewBoolVar(f"post_rest_to_early_{s}_{d}")
            model.Add(sum(x[s, d - 1, shift] for shift in REST_COUNT_SHIFTS) + x[s, d, "早"] == 2).OnlyEnforceIf(term)
            model.Add(sum(x[s, d - 1, shift] for shift in REST_COUNT_SHIFTS) + x[s, d, "早"] != 2).OnlyEnforceIf(term.Not())
            post_rest_early_weight = int(naturalness_weights.get("postRestEarly") or 0)
            post_rest_early_weight = _clamp_weight(
                post_rest_early_weight * _day_shift_pressure_multiplier(required, eligible_counts_by_day, "早", d)
            )
            post_rest_early_terms.append((term, post_rest_early_weight))

            recovery_to_night = model.NewBoolVar(f"recovery_to_night_{s}_{d}")
            model.Add(x[s, d - 1, "明"] + x[s, d, "夜"] == 2).OnlyEnforceIf(recovery_to_night)
            model.Add(x[s, d - 1, "明"] + x[s, d, "夜"] != 2).OnlyEnforceIf(recovery_to_night.Not())
            recovery_to_night_terms.append(recovery_to_night)

            late_to_night = model.NewBoolVar(f"late_to_night_{s}_{d}")
            model.Add(x[s, d - 1, "遅"] + x[s, d, "夜"] == 2).OnlyEnforceIf(late_to_night)
            model.Add(x[s, d - 1, "遅"] + x[s, d, "夜"] != 2).OnlyEnforceIf(late_to_night.Not())
            late_to_night_terms.append((late_to_night, int(naturalness_weights.get("lateToNight") or 0)))

        for d in range(max(0, days - 3)):
            tight_night = model.NewBoolVar(f"tight_night_block_{s}_{d}")
            model.Add(x[s, d, "夜"] + x[s, d + 1, "明"] + sum(x[s, d + 2, shift] for shift in REST_COUNT_SHIFTS) + x[s, d + 3, "夜"] == 4).OnlyEnforceIf(tight_night)
            model.Add(x[s, d, "夜"] + x[s, d + 1, "明"] + sum(x[s, d + 2, shift] for shift in REST_COUNT_SHIFTS) + x[s, d + 3, "夜"] != 4).OnlyEnforceIf(tight_night.Not())
            tight_night_block_terms.append((tight_night, tight_night_weight))

        for d in range(max(0, days - 4)):
            short_gap = model.NewBoolVar(f"short_night_gap_{s}_{d}")
            model.Add(x[s, d, "夜"] + x[s, d + 4, "夜"] == 2).OnlyEnforceIf(short_gap)
            model.Add(x[s, d, "夜"] + x[s, d + 4, "夜"] != 2).OnlyEnforceIf(short_gap.Not())
            short_night_gap_terms.append((short_gap, short_night_gap_weight))

        for start in range(-tail_len, 0):
            if start + 3 < 0 or start + 3 >= days:
                continue
            const_total = 0
            current_terms = []
            pattern = [
                (start, ["夜"]),
                (start + 1, ["明"]),
                (start + 2, REST_COUNT_SHIFTS),
                (start + 3, ["夜"]),
            ]
            valid_window = True
            for day_index, expected_shifts in pattern:
                if day_index < 0:
                    tail_index = len(item.previous_tail) + day_index
                    if tail_index < 0:
                        valid_window = False
                        break
                    const_total += 1 if item.previous_tail[tail_index] in expected_shifts else 0
                else:
                    current_terms.extend(x[s, day_index, shift] for shift in expected_shifts)
            if valid_window and current_terms:
                tight_night = model.NewBoolVar(f"cross_boundary_tight_night_block_{s}_{start}")
                model.Add(const_total + sum(current_terms) == 4).OnlyEnforceIf(tight_night)
                model.Add(const_total + sum(current_terms) != 4).OnlyEnforceIf(tight_night.Not())
                tight_night_block_terms.append((tight_night, tight_night_weight))

        for previous_day in range(-tail_len, 0):
            tail_index = len(item.previous_tail) + previous_day
            if tail_index < 0 or item.previous_tail[tail_index] != "夜":
                continue
            for gap in range(1, 5):
                current_day = previous_day + gap
                if 0 <= current_day < days:
                    short_night_gap_terms.append((x[s, current_day, "夜"], short_night_gap_weight))

        for d in range(max(0, days - 5), days):
            term = model.NewBoolVar(f"month_end_work_pressure_{s}_{d}")
            model.Add(sum(x[s, d, shift] for shift in WORK_SHIFTS) == 1).OnlyEnforceIf(term)
            model.Add(sum(x[s, d, shift] for shift in WORK_SHIFTS) == 0).OnlyEnforceIf(term.Not())
            month_end_work_pressure_terms.append(term)

    objective = []
    for shift, var in shortage_vars:
        objective.append(var * WEIGHT_ALLOWED_SHORTAGE)
    objective.extend(var * 2000 for var in optional_day_shortages)
    objective.extend(var * 500000 for var in unmet_request_terms)
    objective.extend(var * recovery_settings["changePenalty"] for var in change_terms)
    objective.extend(var * recovery_settings["changedWorkPenalty"] for var in changed_work_terms)
    objective.extend(var * 400000 for var in urgent_absence_terms)
    objective.extend(var * 150000 for var in forced_single_shift_terms)
    objective.extend(var * 2500 for var in flexible_night_target_terms)
    objective.extend(var * 300 for var in fairness_terms)
    objective.extend(var * 200 for var in work_count_fairness_terms)
    objective.extend(var * 220 for var in weekend_rest_fairness_terms)
    objective.extend(var * 12000 for var in four_day_terms)
    objective.extend(var * 12000 for var in cross_boundary_four_day_terms)
    objective.extend(var * weight for var, weight in same_shift_run_terms)
    objective.extend(var * weight for var, weight in isolated_workday_terms)
    objective.extend(var * weight for var, weight in isolated_public_holiday_terms)
    objective.extend(var * weight for var, weight in late_to_rest_terms)
    objective.extend(var * weight for var, weight in post_rest_early_terms)
    objective.extend(var * weight for var, weight in tight_night_block_terms)
    objective.extend(var * weight for var, weight in short_night_gap_terms)
    objective.extend(var * 2000 for var in recovery_to_night_terms)
    objective.extend(var * weight for var, weight in late_to_night_terms)
    objective.extend(var * 15 for var in month_end_work_pressure_terms)
    model.Minimize(sum(objective) if objective else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_seconds)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        infeasible_diagnostics = {
            "status": status_name,
            "fallback": "currentSchedule",
            "staffCount": len(staff),
            "reason": "no_feasible_solution",
            **_build_infeasible_diagnostics(payload, staff)
        }
        adjustment_hints = _probe_night_target_adjustments(payload, staff, time_limit_seconds)
        if adjustment_hints:
            infeasible_diagnostics["feasibilityAdjustmentHints"] = adjustment_hints
            infeasible_diagnostics["manualCorrectionHints"] = (
                adjustment_hints + list(infeasible_diagnostics.get("manualCorrectionHints") or [])
            )
        return _fallback_output(payload, current_rows, status_name, staff, infeasible_diagnostics), infeasible_diagnostics

    solved_by_name = {}
    for s, item in enumerate(staff):
        row = []
        for d in range(days):
            shift = next(shift for shift in ASSIGNABLE_SHIFTS if solver.Value(x[s, d, shift]) == 1)
            row.append(SUPPLY_EXCLUSION_DISPLAY_SHIFT.get(shift, "" if shift == BLANK_SHIFT else shift))
        solved_by_name[item.name] = row

    post_process = _improve_day_work_naturalness_by_safe_swaps(
        staff,
        solved_by_name,
        year,
        month,
        days,
        requests,
        supply_exclusions,
        recovery_settings,
    )
    naturalness_report = _build_naturalness_report(staff, solved_by_name, days)
    recovery_diffs = _build_recovery_diffs(payload, recovery_settings, solved_by_name, days)

    schedule = []
    for source_row in payload.get("currentSchedule") or []:
        name = source_row.get("name")
        if not name:
            continue
        shifts = solved_by_name.get(name, list(source_row.get("shifts") or [])[:days])
        schedule.append({
            "role": source_row.get("role") or "",
            "name": name,
            "shifts": shifts,
        })

    diagnostics = {
        "status": status_name,
        "objective": solver.ObjectiveValue(),
        "wallTime": solver.WallTime(),
        "staffCount": len(staff),
        "shortageCount": sum(solver.Value(var) for _, var in shortage_vars),
        "flexibleNightTargets": {
            staff[index].name: target
            for index, target in flexible_night_targets.items()
        },
        "nightDensityProfiles": {
            staff[index].name: profile
            for index, profile in night_density_profiles.items()
        },
        "naturalnessWeightProfiles": {
            staff[index].name: profile
            for index, profile in naturalness_weight_profiles.items()
        },
        "shiftPressureProfiles": {
            "早": _build_shift_pressure_profile(required, eligible_counts_by_day, "早"),
            "遅": _build_shift_pressure_profile(required, eligible_counts_by_day, "遅"),
        },
        "objectiveBreakdown": {
            "allowedShortagePenalty": sum(solver.Value(var) * WEIGHT_ALLOWED_SHORTAGE for shift, var in shortage_vars),
            "optionalDayShortagePenalty": sum(solver.Value(var) * 2000 for var in optional_day_shortages),
            "unmetRequestPenalty": sum(solver.Value(var) * 500000 for var in unmet_request_terms),
            "recoveryChangePenalty": sum(solver.Value(var) * recovery_settings["changePenalty"] for var in change_terms),
            "recoveryChangedWorkPenalty": sum(solver.Value(var) * recovery_settings["changedWorkPenalty"] for var in changed_work_terms),
            "urgentAbsencePenalty": sum(solver.Value(var) * 400000 for var in urgent_absence_terms),
            "singleShiftAvailabilityPenalty": sum(solver.Value(var) * 150000 for var in forced_single_shift_terms),
            "flexibleNightTargetPenalty": sum(solver.Value(var) * 2500 for var in flexible_night_target_terms),
            "eligibleShiftFairnessPenalty": sum(solver.Value(var) * 300 for var in fairness_terms),
            "workCountFairnessPenalty": sum(solver.Value(var) * 200 for var in work_count_fairness_terms),
            "weekendRestFairnessPenalty": sum(solver.Value(var) * 220 for var in weekend_rest_fairness_terms),
            "preferredConsecutiveWorkPenalty": (
                sum(solver.Value(var) * 12000 for var in four_day_terms)
                + sum(solver.Value(var) * 12000 for var in cross_boundary_four_day_terms)
            ),
            "sameShiftRunPenalty": sum(solver.Value(var) * weight for var, weight in same_shift_run_terms),
            "isolatedWorkdayPenalty": sum(solver.Value(var) * weight for var, weight in isolated_workday_terms),
            "isolatedPublicHolidayPenalty": sum(solver.Value(var) * weight for var, weight in isolated_public_holiday_terms),
            "lateToRestPenalty": sum(solver.Value(var) * weight for var, weight in late_to_rest_terms),
            "postRestEarlyPenalty": sum(solver.Value(var) * weight for var, weight in post_rest_early_terms),
            "tightNightBlockPenalty": sum(solver.Value(var) * weight for var, weight in tight_night_block_terms),
            "shortNightBlockGapPenalty": sum(solver.Value(var) * weight for var, weight in short_night_gap_terms),
            "recoveryToNightPenalty": sum(solver.Value(var) * 2000 for var in recovery_to_night_terms),
            "lateToNightPenalty": sum(solver.Value(var) * weight for var, weight in late_to_night_terms),
            "monthEndWorkPressurePenalty": sum(solver.Value(var) * 15 for var in month_end_work_pressure_terms),
        },
        "naturalnessReport": naturalness_report,
        "postProcess": post_process,
        "recoveryDiffs": recovery_diffs,
        "recoverySummary": {
            "enabled": recovery_settings["enabled"],
            "diffCount": len(recovery_diffs),
            "urgentLeaveCount": len(recovery_settings["urgentLeaveByNameDay"]),
            "fixedThroughDay": recovery_settings["fixedThroughDay"],
        },
    }
    output = {
        "schemaVersion": "gas-shift-solver-output/v1",
        "targetYear": year,
        "targetMonth": month,
        "daysInMonth": days,
        "status": status_name,
        "schedule": schedule,
        "diagnostics": diagnostics,
    }
    return output, diagnostics


def _fallback_output(payload: dict, current_rows: Dict[str, dict], status_name: str, staff: List[Staff], diagnostics: dict = None):
    days = int(payload.get("daysInMonth") or 0)
    schedule = []
    for row in payload.get("currentSchedule") or []:
        schedule.append({
            "role": row.get("role") or "",
            "name": row.get("name") or "",
            "shifts": list(row.get("shifts") or [])[:days],
        })
    if diagnostics is None:
        diagnostics = {
            "status": status_name,
            "fallback": "currentSchedule",
            "reason": "no_feasible_solution",
            **_build_infeasible_diagnostics(payload, staff)
        }
    return {
        "schemaVersion": "gas-shift-solver-output/v1",
        "targetYear": payload.get("targetYear"),
        "targetMonth": payload.get("targetMonth"),
        "daysInMonth": days,
        "status": status_name,
        "schedule": schedule,
        "diagnostics": diagnostics,
    }


def _shortage_summary_from_output(output: dict, payload: dict) -> Dict[str, dict]:
    required = payload.get("requiredShiftStaffing") or {}
    month = int(payload.get("targetMonth") or 0)
    days = int(payload.get("daysInMonth") or 0)
    schedule = output.get("schedule") or []
    missing = {}
    for d in range(days):
        for shift in ["早", "遅", "夜"]:
            req = int(required.get(shift) or 0)
            if req <= 0:
                continue
            covered = sum(1 for row in schedule if d < len(row.get("shifts") or []) and row["shifts"][d] == shift)
            if covered < req:
                entry = missing.setdefault(shift, {"count": 0, "dates": []})
                entry["count"] += req - covered
                entry["dates"].append(f"{month}/{d + 1}" if month else str(d + 1))
    return missing


def _format_shortage_summary(missing: Dict[str, dict]) -> str:
    if not missing:
        return "必要枠不足なし"
    parts = []
    for shift, entry in sorted(missing.items()):
        count = int(entry.get("count") or 0) if isinstance(entry, dict) else int(entry or 0)
        dates = list((entry.get("dates") or [])[:3]) if isinstance(entry, dict) else []
        suffix = f"（{', '.join(dates)}" + (" ほか" if isinstance(entry, dict) and len(entry.get("dates") or []) > 3 else "") + "）" if dates else ""
        parts.append(f"{shift}不足{count}件{suffix}")
    return " / ".join(parts)


def _shortage_score(missing: Dict[str, dict]) -> int:
    if not missing:
        return 0
    return sum(int(entry.get("count") or 0) if isinstance(entry, dict) else int(entry or 0) for entry in missing.values())


def _probe_night_target_adjustments(payload: dict, staff: List[Staff], time_limit_seconds: float) -> List[dict]:
    experiment = payload.get("experiment") or {}
    if experiment.get("skipInfeasibleProbes"):
        return []
    fixed_target_staff = [
        item for item in staff
        if "夜" in item.allowed_shifts and _night_target(item.condition) is not None
    ]
    if len(fixed_target_staff) < 2:
        return []

    hints = []
    probe_limit = min(12.0, max(8.0, float(time_limit_seconds or 120.0) / 4.0))
    for item in fixed_target_staff[:8]:
        current_target = _night_target(item.condition)
        if current_target is None:
            continue
        next_target = current_target + 1
        probe_payload = copy.deepcopy(payload)
        probe_payload["experiment"] = {
            **(probe_payload.get("experiment") or {}),
            "skipInfeasibleProbes": True,
        }
        for row in probe_payload.get("staffConditions") or []:
            if str(row.get("name") or "").strip() == item.name:
                row["condition"] = _replace_night_target(row.get("condition") or "", next_target)
                break
        output, _ = solve_shift_schedule(probe_payload, time_limit_seconds=probe_limit)
        if output.get("status") not in ("OPTIMAL", "FEASIBLE"):
            continue
        missing = _shortage_summary_from_output(output, probe_payload)
        remaining_summary = _format_shortage_summary(missing)
        hints.append({
            "issueType": "night_target_adjustment",
            "adjustmentType": "monthly_night_target",
            "remainingShortageSummary": remaining_summary,
            "remainingShortageCount": _shortage_score(missing),
            "priority": "高",
            "date": "月間",
            "shift": "夜勤回数",
            "targetStaff": item.name,
            "currentState": f"希望休は維持 / {item.name} 夜勤 月{current_target}回",
            "suggestedAction": f"希望休を守ったまま、{item.name}の夜勤目安を月{next_target}回にすると作成可能",
            "candidateSummary": remaining_summary,
            "recommendedCandidatesText": f"{item.name}: 月{current_target}回 → 月{next_target}回",
            "redistributionCandidatesText": remaining_summary,
        })
    return sorted(hints, key=lambda item: (int(item.get("remainingShortageCount") or 0), item.get("targetStaff") or ""))[:5]
