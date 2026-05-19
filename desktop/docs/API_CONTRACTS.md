# Local API Contracts

## Purpose

The local API is an internal boundary between the packaged app UI and the schedule engine.

The end user must not operate this API directly.

## Common Response Shape

Success responses use:

```ts
{
  ok: true,
  ...
}
```

Failure responses use:

```ts
{
  ok: false,
  code: "validation_failed",
  message: "technical message",
  userMessage: "ユーザーに表示する短い説明",
  details: {}
}
```

The UI should show `userMessage` first and keep `message/details` for support logs.

Shared helpers:

- `desktop/api/errors.ts`

## `GET /health`

Purpose:

- Confirm that the app-managed local API is ready.

Response:

```ts
{
  ok: true,
  status: "ready",
  app: "shift-desktop-local-api",
  version: "0.1.0"
}
```

## `POST /schedule/validate`

Purpose:

- Validate a monthly schedule document before solving or saving.
- Catch broken data early.
- This does not judge whether the schedule is operationally feasible.

Request:

```ts
{
  document: MonthlyScheduleDocument
}
```

Response:

```ts
{
  ok: true,
  validation: {
    ok: true,
    issues: []
  }
}
```

## `POST /schedule/solve`

Purpose:

- Create or recreate the monthly schedule.
- Convert desktop model to solver input.
- Run solver.
- Convert solver output back to desktop model.
- Return end-user-friendly diagnostic messages.

Request:

```ts
{
  document: MonthlyScheduleDocument,
  options: {
    timeLimitSeconds: 120,
    mode: "create"
  }
}
```

Success response:

```ts
{
  ok: true,
  document: MonthlyScheduleDocument,
  diagnostics: ScheduleDiagnostics,
  messages: [
    "結果: 作成できました（確認事項あり）",
    "確認事項: 許容内の不足 1件 / 勤務希望未充足 1件"
  ]
}
```

Validation failure:

```ts
{
  ok: false,
  code: "validation_failed",
  message: "document validation failed",
  userMessage: "入力内容に確認が必要です。",
  details: {
    issues: []
  }
}
```

Solver failure:

```ts
{
  ok: false,
  code: "solver_failed",
  message: "solver process failed",
  userMessage: "勤務表作成中に問題が発生しました。もう一度実行してください。",
  details: {}
}
```

## `POST /schedule/recover`

Purpose:

- Rebuild a schedule after urgent leave.
- Preserve fixed past days when configured.
- Return changed cells as diffs.

Request:

```ts
{
  document: MonthlyScheduleDocument,
  urgentLeaves: [
    {
      staffId: "staff_001",
      date: "2026-06-17",
      reason: "急休",
      notes: ""
    }
  ],
  options: {
    fixedThroughDate: "2026-06-15",
    timeLimitSeconds: 120
  }
}
```

Response:

```ts
{
  ok: true,
  document: MonthlyScheduleDocument,
  diagnostics: ScheduleDiagnostics,
  messages: [],
  diffs: [
    {
      date: "6/17",
      staffId: "staff_001",
      name: "江藤",
      before: "早",
      after: "欠",
      labels: ["急休反映"]
    }
  ]
}
```

## `POST /export/excel`

Purpose:

- Export a monthly schedule workbook.

Request:

```ts
{
  document: MonthlyScheduleDocument,
  destinationPath: "/path/to/output.xlsx"
}
```

Response:

```ts
{
  ok: true,
  filePath: "/path/to/output.xlsx"
}
```

## Endpoint Implementation Order

1. `GET /health`
2. `POST /schedule/validate`
3. `POST /schedule/solve`
4. `POST /export/excel`
5. `POST /schedule/recover`

## Runtime Rules

- Bind to `127.0.0.1` only.
- Use an automatically selected free port.
- The packaged app owns process startup and shutdown.
- The user must never need to see a port number.
- Technical logs go to app data storage.
