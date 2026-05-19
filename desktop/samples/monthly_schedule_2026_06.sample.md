# Sample Monthly Schedule Document

This sample is for desktop migration design only. It is not a GAS input file.

```json
{
  "schemaVersion": "desktop-shift-schedule/v1",
  "year": 2026,
  "month": 6,
  "staff": [
    {
      "id": "staff_tezima",
      "name": "手嶋",
      "role": "施設長",
      "gender": "男性",
      "employmentType": "常勤",
      "allowedShifts": ["日"],
      "allowedWeekdays": [0, 1, 2, 3, 4, 5, 6],
      "fixedOffWeekday": null,
      "monthlyNightTarget": null,
      "monthlyNightMin": null,
      "monthlyNightMax": null,
      "monthlyWorkLimitDays": null,
      "publicHolidayTargetDays": null,
      "weeklyWorkLimitDays": null,
      "weeklyNightLimit": null,
      "activeFrom": null,
      "activeTo": null,
      "notes": "介護請求不可"
    },
    {
      "id": "staff_eto",
      "name": "江藤",
      "role": "介護リーダー",
      "gender": "男性",
      "employmentType": "常勤",
      "allowedShifts": ["早", "日", "遅", "夜"],
      "allowedWeekdays": [0, 1, 2, 3, 4, 5, 6],
      "fixedOffWeekday": null,
      "monthlyNightTarget": 3,
      "monthlyNightMin": 3,
      "monthlyNightMax": 3,
      "monthlyWorkLimitDays": 21,
      "publicHolidayTargetDays": 9,
      "weeklyWorkLimitDays": 5,
      "weeklyNightLimit": 3,
      "activeFrom": null,
      "activeTo": null,
      "notes": ""
    },
    {
      "id": "staff_ariyama",
      "name": "有山",
      "role": "介護",
      "gender": "男性",
      "employmentType": "常勤",
      "allowedShifts": ["早", "日", "遅", "夜"],
      "allowedWeekdays": [0, 1, 2, 3, 4, 5, 6],
      "fixedOffWeekday": null,
      "monthlyNightTarget": 2,
      "monthlyNightMin": 2,
      "monthlyNightMax": 2,
      "monthlyWorkLimitDays": 21,
      "publicHolidayTargetDays": 9,
      "weeklyWorkLimitDays": 5,
      "weeklyNightLimit": 3,
      "activeFrom": null,
      "activeTo": null,
      "notes": ""
    }
  ],
  "requests": [
    {
      "id": "req_eto_0606",
      "staffId": "staff_eto",
      "type": "事前希望休",
      "startDate": "2026-06-06",
      "endDate": "2026-06-06",
      "notes": ""
    },
    {
      "id": "req_ariyama_0606",
      "staffId": "staff_ariyama",
      "type": "希望日勤",
      "startDate": "2026-06-06",
      "endDate": "2026-06-06",
      "notes": ""
    },
    {
      "id": "req_tezima_trip_0606",
      "staffId": "staff_tezima",
      "type": "出張",
      "startDate": "2026-06-06",
      "endDate": "2026-06-06",
      "notes": ""
    }
  ],
  "requirements": {
    "early": 1,
    "day": 1,
    "late": 1,
    "night": 1,
    "allowedShortageShifts": ["遅"],
    "femaleRequiredWeekdays": []
  },
  "previousMonthTail": {
    "staff_eto": ["遅", "夜", "明", "公", "夜", "明", "早"]
  },
  "schedule": [
    {
      "staffId": "staff_eto",
      "role": "介護リーダー",
      "name": "江藤",
      "shifts": ["早", "夜", "明", "公", "早", "公"]
    },
    {
      "staffId": "staff_ariyama",
      "role": "介護",
      "name": "有山",
      "shifts": ["日", "日", "遅", "公", "日", "早"]
    }
  ],
  "diagnostics": {
    "status": "ok_with_notes",
    "summary": {
      "canUse": true,
      "requiredFixCount": 0,
      "allowedShortageCount": 1,
      "blockingShortageCount": 0,
      "unmetLeaveRequestCount": 0,
      "unmetShiftRequestCount": 1
    },
    "messages": [
      "結果: 作成できました（確認事項あり）",
      "確認事項: 許容内の不足 1件 / 勤務希望未充足 1件",
      "不足: 6/3 遅 1名（許容内）",
      "勤務希望: 6/6 有山 希望日勤 → 早（未充足）"
    ],
    "shortages": [
      {
        "date": "6/3",
        "shift": "遅",
        "count": 1,
        "allowed": true,
        "reasons": ["月の勤務上限x3", "週の勤務上限x3", "同じ日に別勤務x3"]
      }
    ],
    "unmetRequests": [
      {
        "date": "6/6",
        "staffId": "staff_ariyama",
        "name": "有山",
        "type": "希望日勤",
        "assignedShift": "早",
        "blocking": false
      }
    ],
    "suggestions": [
      {
        "type": "redistribution",
        "priority": "高",
        "target": "6/3 遅",
        "message": "前後日の勤務を再配分",
        "remainingIssueSummary": "槇(早: 当日他シフト・翌日早出)"
      }
    ]
  }
}
```
