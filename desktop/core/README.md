# Core Module

The core module defines desktop-native schedule data and pure transformations.

## Files

- `domain.ts`: desktop data model types
- `diagnosticMessages.ts`: end-user diagnostic message formatting
- `solverInput.ts`: adapter from desktop model to solver input payload
- `solverOutput.ts`: adapter from solver output payload back to desktop schedule and diagnostics
- `validation.ts`: runtime validation for desktop monthly schedule documents
- `fixtures.ts`: small in-memory fixtures for desktop-only smoke tests

## Rules

- Do not import GAS files.
- Do not depend on Google Sheets cell coordinates.
- Keep solver input conversion isolated in `solverInput.ts`.
- Keep user-facing language in `diagnosticMessages.ts`.

## Near-term Tasks

1. Add adapter fixtures and tests.
2. Add conversion from desktop diagnostics to UI view models.
3. Add API request/response contracts.
