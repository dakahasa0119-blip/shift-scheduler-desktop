# Local API Plan

The local API must be started and stopped by the packaged desktop app.

Users must not operate this API directly.

## Initial Endpoints

- `GET /health`
- `POST /schedule/solve`
- `POST /schedule/validate`
- `POST /schedule/recover`
- `POST /export/excel`
- `POST /export/pdf`
- `POST /document/save`
- `GET /document/load`
- `POST /document/backup`

Contracts:

- `contracts.ts`
- `../docs/API_CONTRACTS.md`

Handler skeleton:

- `handlers.ts`
- `mockSolverRunner.ts`

The handler layer fixes the processing order before a concrete server is introduced:

```text
validate document
  -> convert to solver input
  -> call SolverRunner
  -> convert solver output back to desktop document
  -> return user-facing messages
```

## Runtime Rules

- Bind only to `127.0.0.1`.
- Use an automatically selected free port.
- Retry startup on port conflict.
- Stop child processes when the app exits.
- Write logs under the app data directory.
- Show end-user messages in the UI, not raw stack traces.

## First Prototype

The first prototype can run as a developer-started service on Linux, but the production direction remains app-managed startup.
