# デスクトップ版 データモデル草案

## 方針

デスクトップ版では、Google Sheetsのセル位置に依存しないデータ形式を使う。

このデータモデルは以下で共通利用する。

- 画面表示
- ローカルAPI
- solver入力
- 判定
- SQLite保存
- Excel/PDF出力
- バックアップ

## 基本単位

勤務表は月単位で扱う。

```json
{
  "schemaVersion": "desktop-shift-schedule/v1",
  "year": 2026,
  "month": 6,
  "staff": [],
  "requests": [],
  "requirements": {},
  "previousMonthTail": {},
  "schedule": [],
  "diagnostics": {}
}
```

## 職員

```json
{
  "id": "staff_001",
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
}
```

### 補足

- `id` は内部識別子。表示は `name` を使う。
- `role` は勤務表の名前横に表示する職種。
- `allowedWeekdays` は日曜を `0` とする。
- `monthlyNightTarget` が未設定の場合は、必要夜勤数から動的に配分する。
- 入職前、退職後は `activeFrom` / `activeTo` で表現する。

## 希望・休暇・供給除外

```json
{
  "id": "request_001",
  "staffId": "staff_001",
  "type": "事前希望休",
  "startDate": "2026-06-06",
  "endDate": "2026-06-06",
  "notes": ""
}
```

### type

勤務希望:

- `希望早出`
- `希望日勤`
- `希望遅出`
- `希望夜勤`

休暇:

- `事前希望休`
- `有給`
- `特別休`

供給除外:

- `出張`
- `産休`
- `育休`
- `休職`
- `長期病欠`
- `入職前`
- `退職後`

### 判定方針

- `事前希望休`、`有給`、`特別休` は原則hard制約。
- `希望早出`、`希望日勤`、`希望遅出`、`希望夜勤` は希望扱い。未充足でも作成停止にしない。
- `出張`、`産休`、`育休`、`休職` などは勤務表に理由を表示する。
- システム内部用の `除` は人間向け表示には使わない。

## 必要配置

```json
{
  "early": 1,
  "day": 1,
  "late": 1,
  "night": 1,
  "allowedShortageShifts": ["遅"],
  "femaleRequiredWeekdays": []
}
```

### 補足

- 表示上の勤務記号は `早`、`日`、`遅`、`夜`。
- API上のキーは英語でもよいが、出力時は日本語記号に戻す。
- `遅` の不足は許容不足として扱える。
- `早`、`夜` の不足は原則停止対象。

## 前月末引き継ぎ

```json
{
  "staff_001": ["遅", "夜", "明", "公", "夜", "明", "早"]
}
```

### 補足

- 最大7日分を保持する。
- 月初の `明`、`公` 固定判定に使う。
- 月跨ぎの連勤、夜勤間隔判定にも使う。

## 勤務表

```json
{
  "staffId": "staff_001",
  "role": "介護リーダー",
  "name": "江藤",
  "shifts": ["早", "夜", "明", "公"]
}
```

### 勤務記号

勤務:

- `早`
- `日`
- `遅`
- `夜`
- `明`

休み:

- `公`
- `休`
- `有`
- `特`
- `欠`

供給除外:

- `出張`
- `産休`
- `育休`
- `休`
- 空白

### 表示方針

- `休職` は表示上 `休`。
- `入職前`、`退職後` は空白。
- `出張`、`産休`、`育休` は理由をそのまま表示。
- 汎用的な `除` は表示しない。

## 診断結果

```json
{
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
  "shortages": [],
  "unmetRequests": [],
  "suggestions": []
}
```

## エンドユーザー向けメッセージ

表示順は固定する。

1. 結果
2. 確認事項
3. 修正必須
4. 不足
5. 勤務希望・休暇希望
6. 対応候補

### 作成成功・確認あり

```text
結果: 作成できました（確認事項あり）
確認事項: 許容内の不足 1件 / 勤務希望未充足 1件
不足: 6/3 遅 1名（許容内）
勤務希望: 6/6 有山 希望日勤 → 早（未充足）
```

### 作成停止

```text
結果: 作成を止めました（修正が必要です）
確認事項: 修正必須 1件
止めた理由: 休暇希望を満たせません
修正必須: 6/17 松田 事前希望休 → 夜
対応候補: 夜勤回数または前後日の夜勤配置を調整してください
```

## solver入力への変換

既存solverに渡すときは、当面 `gas-shift-solver-input/v1` に近い形へ変換する。

変換対象:

- `staff` → `staffConditions`
- `requests` → `leaveEntries` / `supplyExclusions`
- `requirements` → `requiredShiftStaffing`
- `previousMonthTail` → `previousMonthTailByName`
- `schedule` → `currentSchedule`

デスクトップ版の内部モデルとsolver入力を直接同一にしない。
UIや保存形式をsolver都合に寄せすぎないため。

## solver出力からの変換

solverの作成結果は、デスクトップ内部モデルへ戻してから画面や保存に使う。

変換対象:

- `schedule` → `schedule`
- `diagnostics.deploymentReadiness` → `diagnostics.summary`
- `diagnostics.operationalShortageReasons` → `diagnostics.shortages`
- `diagnostics.requestDiagnostics.unmetRequests` → `diagnostics.unmetRequests`
- `diagnostics.manualCorrectionHints` → `diagnostics.suggestions`

ユーザー向けメッセージは、solverの生テキストではなく `ScheduleDiagnostics` から生成する。

理由:

- Linux/Windows版で表示順と文言を統一するため
- solver内部用語をUIに出さないため
- 今後solverを差し替えても画面側を壊さないため

## 未決事項

- `staffId` をUUIDにするか、連番にするか
- 職種マスタを分離するか
- 勤務記号マスタを持つか
- 施設ごとの必要配置を複数保存するか
- 急休リカバリーを同じ `requests` に入れるか、別モデルにするか
- Excel出力時のセルコメントをどう扱うか

## 初期バリデーション

`desktop/core/validation.ts` で、ローカルAPIに入る前の最低限の検証を行う。

検証対象:

- schemaVersion
- 年月
- 職員ID・職員名の空欄
- 職員ID・職員名の重複
- 勤務可能シフト
- 勤務可能曜日
- 固定休曜日
- 希望・休暇の職員ID
- 希望・休暇の日付形式
- 必要配置の負数
- 前月末引き継ぎの職員ID
- 勤務表行の職員ID

ここでは業務的な成立可否までは見ない。

成立可否は solver と判定ロジックで扱う。
