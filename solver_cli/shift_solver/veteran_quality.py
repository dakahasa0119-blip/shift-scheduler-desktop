from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Set


MODEL_VERSION = "veteran-rule-model/20260523_all_plus_medium_candidate3_triage_carelate_rank_min20_softiso_stress_v2"
MODEL_SAMPLE_COUNT = 468
MODEL_PATTERN_COUNT = 241


ACTION_BY_DECISION = {
    "blocking_operational": "fix_feasibility_first",
    "harmful_tradeoff": "discourage_unpaid_tradeoff",
    "needs_solver_improvement": "increase_targeted_penalty",
    "needs_quality_review": "add_rule_dimension_or_weight",
    "staffing_limited_accept": "preserve_as_staffing_pressure",
    "tradeoff_accept_candidate": "allow_when_tradeoff_beneficial",
    "accept_candidate": "prefer_candidate",
}
DECISION_BY_ACTION = {action: decision for decision, action in ACTION_BY_DECISION.items()}
_POLICY_CACHE: Dict[str, Any] | None = None


def _count(report: Dict[str, Any], key: str) -> int:
    bucket = report.get(key) or {}
    return int(bucket.get("count") or 0)


def _samples(report: Dict[str, Any], key: str, limit: int = 5) -> List[dict]:
    bucket = report.get(key) or {}
    return list(bucket.get("samples") or [])[:limit]


def _four_work_improvement_count(report: Dict[str, Any]) -> int:
    return sum(
        1
        for sample in _samples(report, "fourConsecutiveWork", 100)
        if sample.get("disposition") == "改善対象"
    )


def _metric_bucket(value: int, low: int, high: int) -> str:
    if value <= 0:
        return "none"
    if value <= low:
        return "low"
    if value <= high:
        return "medium"
    return "high"


def _add_signal(signals: List[dict], metric: str, count: int, severity: str, samples: List[dict]) -> None:
    if count <= 0:
        return
    signals.append({
        "metric": metric,
        "count": count,
        "severity": severity,
        "samples": samples,
    })


def _load_axis_policy() -> Dict[str, Any]:
    global _POLICY_CACHE
    if _POLICY_CACHE is not None:
        return _POLICY_CACHE
    policy_path = Path(__file__).with_name("veteran_rule_policy.json")
    try:
        _POLICY_CACHE = json.loads(policy_path.read_text(encoding="utf-8"))
    except OSError:
        _POLICY_CACHE = {}
    return _POLICY_CACHE


def _axis_match_score(candidate_axes: Dict[str, str], policy_axes: Dict[str, str]) -> int:
    score = 0
    for key, candidate_value in candidate_axes.items():
        policy_value = str(policy_axes.get(key) or "")
        if policy_value == candidate_value:
            score += 2
        elif key in {"role", "availability"}:
            candidate_parts = _axis_parts(candidate_value)
            policy_parts = _axis_parts(policy_value)
            if candidate_parts and policy_parts and candidate_parts.intersection(policy_parts):
                score += 1
        elif key == "familyContext" and candidate_value == "staffing_pressure_context" and "staffing_pressure" in policy_value:
            score += 1
    return score


def _axis_parts(value: str) -> Set[str]:
    text = str(value or "")
    if not text or text in {"mixed", "role_none", "availability_none"}:
        return set()
    return {part for part in text.split("+") if part}


def _find_axis_policy(axes: Dict[str, str]) -> Dict[str, Any] | None:
    policy = _load_axis_policy()
    policies = policy.get("policies") or []
    if not policies:
        return None
    ranked = []
    for item in policies:
        policy_axes = item.get("axes") or {}
        match_score = _axis_match_score(axes, policy_axes)
        exact = all(str(policy_axes.get(key) or "") == str(value or "") for key, value in axes.items())
        ranked.append((exact, match_score, int(item.get("count") or 0), float(item.get("confidence") or 0), item))
    ranked.sort(key=lambda row: (row[0], row[1], row[2], row[3]), reverse=True)
    exact, match_score, _, _, item = ranked[0]
    policy_axes = item.get("axes") or {}
    same_core = (
        str(policy_axes.get("feasibility") or "") == str(axes.get("feasibility") or "")
        and str(policy_axes.get("rhythm") or "") == str(axes.get("rhythm") or "")
        and str(policy_axes.get("naturalness") or "") == str(axes.get("naturalness") or "")
    )
    if exact or (match_score >= 9 and same_core):
        return {
            "matchType": "exact" if exact else "partial",
            "matchScore": match_score,
            "policy": item,
        }
    return None


def _split_allowed_shifts(value: Any) -> List[str]:
    text = str(value or "")
    for sep in [",", "、", "/", "／", " "]:
        text = text.replace(sep, "・")
    return [item.strip() for item in text.split("・") if item.strip()]


def _shift_family(allowed_shift: Any) -> str:
    allowed = _split_allowed_shifts(allowed_shift)
    if not allowed:
        return "unknown_shift"
    allowed_set = set(allowed)
    if allowed == ["夜"]:
        return "night_only"
    if "日" in allowed_set and "遅" in allowed_set and "早" not in allowed_set and "夜" not in allowed_set:
        return "limited_day_late"
    if all(shift in allowed_set for shift in ["早", "日", "遅", "夜"]):
        return "full_shift"
    if all(shift in {"早", "日", "遅"} for shift in allowed):
        return "day_shift_limited"
    return "mixed_shift_limited"


def _profile_class_from_row(row: Dict[str, Any]) -> str:
    role = str(row.get("staffType") or row.get("role") or "")
    condition = str(row.get("condition") or "")
    allowed = _split_allowed_shifts(row.get("allowedShift") or row.get("shift") or "")
    allowed_set = set(allowed)
    night_target = None
    for token in condition.replace("月", " ").replace("回", " ").split():
        if token.isdigit():
            night_target = int(token)
            break
    if role == "施設長" or "介護請求不可" in condition:
        return "manager"
    if allowed == ["夜"]:
        return "night_only"
    if role == "夜専" or ("夜" in allowed_set and night_target is not None and night_target >= 6):
        return "night_primary"
    if allowed_set and allowed_set.issubset({"早", "日", "遅"}) and "遅" in allowed_set and "早" not in allowed_set:
        return "limited_day_late"
    if len(allowed) <= 2:
        return "limited_shift"
    return "general_care"


def _staff_context(payload: Dict[str, Any] | None, diagnostics: Dict[str, Any]) -> Dict[str, dict]:
    context: Dict[str, dict] = {}
    for row in (payload or {}).get("staffConditions") or []:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        context[name] = {
            "class": _profile_class_from_row(row),
            "allowedShiftSignature": str(row.get("allowedShift") or row.get("shift") or ""),
            "shiftFamily": _shift_family(row.get("allowedShift") or row.get("shift") or ""),
            "condition": str(row.get("condition") or ""),
        }
    for name, profile in (diagnostics.get("staffSuitabilityProfiles") or {}).items():
        item = context.setdefault(str(name), {})
        item.setdefault("class", profile.get("class") or "unknown")
        item.setdefault("allowedShiftSignature", profile.get("allowedShiftSignature") or "")
        item.setdefault("shiftFamily", _shift_family(profile.get("allowedShiftSignature") or ""))
        item["dynamicPressure"] = profile.get("dynamicPressure") or {}
    return context


def _signal_names(naturalness: Dict[str, Any], keys: List[str]) -> Set[str]:
    names: Set[str] = set()
    for key in keys:
        for sample in _samples(naturalness, key, 100):
            name = str(sample.get("name") or "").strip()
            if name:
                names.add(name)
    return names


def _compact_bucket(values: List[str], fallback: str) -> str:
    unique = sorted({value for value in values if value})
    if not unique:
        return fallback
    if len(unique) > 3:
        return "mixed"
    return "+".join(unique)


def _policy_role_class(staff_class: str) -> str:
    if staff_class in {"general_care", "limited_shift"}:
        return "care"
    if staff_class == "manager":
        return "role_none"
    return staff_class


def _count_contextual_samples(
    naturalness: Dict[str, Any],
    metric: str,
    context: Dict[str, dict],
    staff_class: str = "",
    shift_family: str = "",
) -> int:
    count = 0
    for sample in _samples(naturalness, metric, 100):
        profile = context.get(str(sample.get("name") or ""))
        if not profile:
            continue
        if staff_class and profile.get("class") == staff_class:
            count += 1
        elif shift_family and profile.get("shiftFamily") == shift_family:
            count += 1
    return count


def _max_run(shifts: List[str], target: str) -> int:
    current = 0
    max_value = 0
    for shift in shifts:
        if shift == target:
            current += 1
            max_value = max(max_value, current)
        else:
            current = 0
    return max_value


def _care_late_block_report(diagnostics: Dict[str, Any], context: Dict[str, dict]) -> Dict[str, Any]:
    samples = []
    for row in diagnostics.get("schedule") or []:
        name = str(row.get("name") or "")
        profile = context.get(name) or {}
        if profile.get("class") != "general_care":
            continue
        shifts = list(row.get("shifts") or [])
        late_count = sum(1 for shift in shifts if shift == "遅")
        max_late_run = _max_run(shifts, "遅")
        if late_count >= 6 and max_late_run >= 3:
            samples.append({
                "name": name,
                "role": row.get("role") or "",
                "late": late_count,
                "maxLateRun": max_late_run,
                "detail": f"遅{late_count}/最大連続{max_late_run}",
            })
    return {
        "count": len(samples),
        "samples": samples[:5],
    }


def _candidate_axes(status: str, metrics: Dict[str, int], naturalness: Dict[str, Any], context: Dict[str, dict]) -> Dict[str, str]:
    if status not in {"OPTIMAL", "FEASIBLE"}:
        feasibility = "hard_blocked"
    elif metrics["shortage"] > 0:
        feasibility = "shortage_remaining"
    elif metrics["unmet"] > 0:
        feasibility = "unmet_remaining"
    else:
        feasibility = "feasible_clean"

    if metrics["fiveConsecutiveWork"] > 0 or metrics["fourConsecutiveWorkImprove"] > 0:
        rhythm = "four_work_present"
    elif metrics["recoveryToNight"] > 0:
        rhythm = "beneficial_bridge_rhythm" if metrics["recoveryToNight"] <= 1 else "night_gap_worse"
    elif metrics["shortNightBlockGap"] > 0:
        rhythm = "night_gap_worse"
    else:
        rhythm = "rhythm_stable"

    names = _signal_names(naturalness, [
        "fiveConsecutiveWork",
        "fourConsecutiveWork",
        "sameShiftRun",
        "isolatedWorkday",
        "shortNightBlockGap",
        "recoveryToNight",
        "lateToRest",
        "postRestEarly",
    ])
    profiles = [context[name] for name in names if name in context]
    role = _compact_bucket([_policy_role_class(str(profile.get("class") or "")) for profile in profiles], "role_none")
    availability = _compact_bucket([str(profile.get("shiftFamily") or "") for profile in profiles], "availability_none")

    max_pressure = 0.0
    for profile in profiles:
        pressure = (profile.get("dynamicPressure") or {}).get("constraintPressure") or 0
        max_pressure = max(max_pressure, float(pressure))
    if max_pressure >= 0.30 or metrics["shortage"] > 0 or metrics["unmet"] > 0:
        family_context = "staffing_pressure_context"
    elif any(str(profile.get("condition") or "").strip() not in {"", "なし"} for profile in profiles):
        family_context = "condition_context"
    else:
        family_context = "standard_context"

    if metrics["sameShiftRun"] > 0:
        fairness = "same_shift_run_worse"
    else:
        fairness = "fairness_stable"

    if metrics["isolatedWorkday"] > 0 or metrics["isolatedPublicHoliday"] > 0:
        natural = "isolation_worse"
    elif metrics["lateToRest"] > 0 or metrics["postRestEarly"] > 0:
        natural = "edge_burden_worse"
    else:
        natural = "naturalness_stable"

    return {
        "feasibility": feasibility,
        "rhythm": rhythm,
        "role": role,
        "availability": availability,
        "familyContext": family_context,
        "fairness": fairness,
        "naturalness": natural,
    }


def evaluate_veteran_quality(status: str, diagnostics: Dict[str, Any], payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    naturalness = diagnostics.get("naturalnessReport") or {}
    objective = diagnostics.get("objectiveBreakdown") or {}
    context = _staff_context(payload, diagnostics)
    shortage_count = int(diagnostics.get("shortageCount") or 0)
    unmet_penalty = int(objective.get("unmetRequestPenalty") or 0)
    unmet_count = int(round(unmet_penalty / 500000)) if unmet_penalty > 0 else 0

    metrics = {
        "shortage": shortage_count,
        "unmet": unmet_count,
        "fiveConsecutiveWork": _count(naturalness, "fiveConsecutiveWork"),
        "fourConsecutiveWork": _count(naturalness, "fourConsecutiveWork"),
        "fourConsecutiveWorkImprove": _four_work_improvement_count(naturalness),
        "sameShiftRun": _count(naturalness, "sameShiftRun"),
        "isolatedWorkday": _count(naturalness, "isolatedWorkday"),
        "isolatedPublicHoliday": _count(naturalness, "isolatedPublicHoliday"),
        "lateToRest": _count(naturalness, "lateToRest"),
        "postRestEarly": _count(naturalness, "postRestEarly"),
        "tightNightBlock": _count(naturalness, "tightNightBlock"),
        "shortNightBlockGap": _count(naturalness, "shortNightBlockGap"),
        "recoveryToNight": _count(naturalness, "recoveryToNight"),
        "lateToNight": _count(naturalness, "lateToNight"),
    }
    care_late_block = _care_late_block_report(diagnostics, context)
    metrics["careLateBlock"] = int(care_late_block.get("count") or 0)

    limited_day_late_same_run = _count_contextual_samples(naturalness, "sameShiftRun", context, shift_family="limited_day_late")
    night_primary_short_gap = _count_contextual_samples(naturalness, "shortNightBlockGap", context, staff_class="night_primary")
    night_primary_recovery_to_night = _count_contextual_samples(naturalness, "recoveryToNight", context, staff_class="night_primary")
    non_night_primary_recovery_to_night = max(0, metrics["recoveryToNight"] - night_primary_recovery_to_night)
    contextual_relief = min(metrics["sameShiftRun"], limited_day_late_same_run) * 55
    contextual_relief += min(metrics["shortNightBlockGap"], night_primary_short_gap) * 45
    contextual_relief += min(metrics["recoveryToNight"], night_primary_recovery_to_night) * 120
    axes = _candidate_axes(status, metrics, naturalness, context)
    policy_match = _find_axis_policy(axes)

    score = (
        metrics["shortage"] * 800
        + metrics["unmet"] * 600
        + metrics["fiveConsecutiveWork"] * 900
        + metrics["fourConsecutiveWorkImprove"] * 520
        + max(0, metrics["fourConsecutiveWork"] - metrics["fourConsecutiveWorkImprove"]) * 180
        + metrics["recoveryToNight"] * 360
        + metrics["shortNightBlockGap"] * 120
        + metrics["tightNightBlock"] * 90
        + metrics["sameShiftRun"] * 80
        + metrics["lateToRest"] * 45
        + metrics["postRestEarly"] * 45
        + metrics["lateToNight"] * 70
        + metrics["careLateBlock"] * 700
        + metrics["isolatedWorkday"] * 25
        + metrics["isolatedPublicHoliday"] * 8
    )
    score = max(0, score - contextual_relief)

    signals: List[dict] = []
    _add_signal(signals, "shortage", metrics["shortage"], "blocking", [])
    _add_signal(signals, "unmet", metrics["unmet"], "blocking", [])
    _add_signal(signals, "fiveConsecutiveWork", metrics["fiveConsecutiveWork"], "improve", _samples(naturalness, "fiveConsecutiveWork"))
    _add_signal(signals, "fourConsecutiveWork", metrics["fourConsecutiveWork"], "watch", _samples(naturalness, "fourConsecutiveWork"))
    _add_signal(signals, "recoveryToNight", metrics["recoveryToNight"], "tradeoff", _samples(naturalness, "recoveryToNight"))
    _add_signal(signals, "shortNightBlockGap", metrics["shortNightBlockGap"], "review", _samples(naturalness, "shortNightBlockGap"))
    _add_signal(signals, "isolatedWorkday", metrics["isolatedWorkday"], "review", _samples(naturalness, "isolatedWorkday"))
    _add_signal(signals, "sameShiftRun", metrics["sameShiftRun"], "review", _samples(naturalness, "sameShiftRun"))
    _add_signal(signals, "careLateBlock", metrics["careLateBlock"], "improve", care_late_block.get("samples") or [])
    if contextual_relief > 0:
        signals.append({
            "metric": "contextualRelief",
            "count": contextual_relief,
            "severity": "context",
            "samples": [{
                "limitedDayLateSameRun": limited_day_late_same_run,
                "nightPrimaryShortNightGap": night_primary_short_gap,
                "nightPrimaryRecoveryToNight": night_primary_recovery_to_night,
                "reason": "可能勤務と雇用形態に起因する偏りは、標準ペナルティより軽く見る",
            }],
        })

    if status not in {"OPTIMAL", "FEASIBLE"}:
        decision = "blocking_operational"
        reason = "solver が成立解を返していない"
    elif metrics["shortage"] > 0 or metrics["unmet"] > 0:
        decision = "staffing_limited_accept"
        reason = "成立解だが不足または希望未充足が残るため、人員制約として理由付きで扱う"
    elif metrics["fiveConsecutiveWork"] > 0:
        decision = "needs_solver_improvement"
        reason = "5連勤が残るため、候補選定では強く下げる"
    elif metrics["fourConsecutiveWorkImprove"] >= 8 or (metrics["fourConsecutiveWorkImprove"] > 0 and score >= 8000):
        decision = "needs_solver_improvement"
        reason = "改善対象の4連勤が多く残るため、候補選定では強く下げる"
    elif metrics["fourConsecutiveWorkImprove"] > 0:
        decision = "needs_quality_review"
        reason = "改善対象の4連勤が残るため、実勤務行で品質レビューする"
    elif metrics["careLateBlock"] >= 2 or (metrics["careLateBlock"] > 0 and score >= 5000):
        decision = "needs_solver_improvement"
        reason = "介護職の遅番ブロックが強く残るため、候補選定では強く下げる"
    elif metrics["careLateBlock"] > 0:
        decision = "needs_quality_review"
        reason = "介護職の遅番ブロックが残るため、実勤務行で品質レビューする"
    elif non_night_primary_recovery_to_night > 1:
        decision = "needs_solver_improvement"
        reason = "夜勤ブリッジが月1目安を超えている"
    elif non_night_primary_recovery_to_night == 1 and score < 1600:
        decision = "tradeoff_accept_candidate"
        reason = "夜勤ブリッジは月1目安内で、他の主要崩れが軽い"
    elif (
        metrics["shortNightBlockGap"] - min(metrics["shortNightBlockGap"], night_primary_short_gap) > 6
        or (metrics["isolatedWorkday"] > 4 and score >= 3000)
        or metrics["sameShiftRun"] - min(metrics["sameShiftRun"], limited_day_late_same_run) > 2
    ):
        decision = "needs_quality_review"
        reason = "成立性はあるが、自然さの残差が強い"
    else:
        decision = "accept_candidate"
        reason = "重要な未解決項目が少なく、採用候補として読める"

    if status in {"OPTIMAL", "FEASIBLE"} and policy_match:
        policy = policy_match["policy"]
        confidence = float(policy.get("confidence") or 0)
        if policy_match["matchType"] == "exact" and confidence >= 0.75:
            decision = str(policy.get("recommendedDecision") or decision)
            reason = f"実サンプルの7軸ポリシーに一致: {decision}"
        elif policy_match["matchType"] == "partial" and confidence >= 0.90:
            action = str(policy.get("recommendedAction") or "")
            if action in {"prefer_candidate", "preserve_as_staffing_pressure"}:
                score = max(0, score - 120)

    action = ACTION_BY_DECISION[decision]
    if policy_match and policy_match["matchType"] == "exact":
        policy_action = str(policy_match["policy"].get("recommendedAction") or "")
        if policy_action in DECISION_BY_ACTION and float(policy_match["policy"].get("confidence") or 0) >= 0.75:
            action = policy_action

    return {
        "schemaVersion": "veteran-evaluation/v1",
        "modelVersion": MODEL_VERSION,
        "modelSummary": {
            "sampleCount": MODEL_SAMPLE_COUNT,
            "patternCount": MODEL_PATTERN_COUNT,
            "unresolvedPatternCount": 0,
        },
        "decision": decision,
        "action": action,
        "score": score,
        "reason": reason,
        "metrics": metrics,
        "buckets": {
            "shortage": _metric_bucket(metrics["shortage"], 1, 3),
            "unmet": _metric_bucket(metrics["unmet"], 1, 3),
            "rhythm": _metric_bucket(
                metrics["fiveConsecutiveWork"] + metrics["fourConsecutiveWorkImprove"] + metrics["recoveryToNight"],
                1,
                3,
            ),
            "naturalness": _metric_bucket(
                metrics["shortNightBlockGap"] + metrics["isolatedWorkday"] + metrics["sameShiftRun"],
                4,
                10,
            ),
        },
        "patternApproximation": {
            "axes": axes,
            "contextualRelief": contextual_relief,
            "limitedDayLateSameRun": limited_day_late_same_run,
            "nightPrimaryShortNightGap": night_primary_short_gap,
            "nightPrimaryRecoveryToNight": night_primary_recovery_to_night,
            "policyMatch": policy_match,
        },
        "signals": signals[:12],
    }
