# Storage Plan

JSON document storage is implemented for the current prototype.

SQLite remains the longer-term storage candidate once editing history and multi-table queries are needed.

## Goals

- Save staff, requests, requirements, schedules, and diagnostics locally.
- Support backup and restore without Google Sheets.
- Keep enough history to compare schedule changes.
- Avoid requiring the user to choose internal storage files.

## Candidate Tables

- `staff`
- `staff_requests`
- `staffing_requirements`
- `monthly_schedules`
- `schedule_rows`
- `diagnostics`
- `change_history`
- `app_settings`

## Current Prototype

- `JsonDocumentStore` saves the current monthly schedule as `current-schedule.json`.
- `backup()` writes timestamped JSON backups.
- The app chooses the platform-specific data directory automatically.
- Users operate this through the app shell actions: 保存, 読込, バックアップ.
- Prototype-stage data editing is available through JSON反映 and JSON出力 in the app shell.
- `SHIFT_DESKTOP_DATA_DIR` can override the data directory for tests and support work.

## App Data Location

The packaged app should choose the platform-specific app data directory automatically.

- Linux: XDG data directory
- Windows: `%APPDATA%`

Users should choose only export and backup destinations.
