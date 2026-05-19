# Desktop Migration Workspace

This directory is the isolated workspace for the future Linux/Windows desktop version of the shift scheduler.

## Hard Rule

Do not modify the existing GAS production files for desktop migration work.

The current GAS version remains the live operational system. Desktop migration work must stay under `desktop/` unless the user explicitly approves otherwise.

## Documents

- [Migration Plan](docs/MIGRATION_PLAN.md)
- [Data Model Draft](docs/DATA_MODEL.md)
- [Solver Adapter Design](docs/SOLVER_ADAPTER.md)
- [Solver Bundling Plan](docs/SOLVER_BUNDLING.md)
- [Local API Contracts](docs/API_CONTRACTS.md)
- [API Handler Flow](docs/API_HANDLER_FLOW.md)
- [Test Plan](docs/TEST_PLAN.md)

## Initial Direction

The desktop version should eventually run as a packaged application where the user does not manage local servers, ports, solver processes, or logs.

Expected internal shape:

```text
UI
  -> local API
  -> core schedule model
  -> OR-Tools solver
  -> SQLite / Excel / PDF
```

The first technical goal is a Linux prototype that can:

1. Load a sample monthly schedule JSON.
2. Run the solver.
3. Return an end-user-friendly diagnostic message.
4. Export a table-shaped result.

Windows packaging comes after the prototype is stable.

## Current Prototype Status

- Core schedule model is isolated under `core/`.
- Local API handlers are isolated under `api/`.
- `api/localServer.ts` can start a loopback-only local API on `127.0.0.1`.
- `api/bootstrap.ts` wires the local API to the bundled solver without user-managed ports or solver commands.
- Solver execution is isolated behind the `SolverRunner` boundary.
- `app/diagnosticViewModel.ts` prepares end-user-facing diagnostic sections for the future screen.
- `app/scheduleTableViewModel.ts` prepares a dynamic monthly table from staff and schedule data.
- `app/appViewModel.ts` combines status, actions, diagnostics, and schedule table state for the future screen.
- `app/htmlRenderer.ts` renders the first browser-checkable screen from the app view model.
- The app shell includes a JSON data editor for prototype-stage input, import, and export.
- The app shell includes TSV schedule import/export for spreadsheet-style schedule edits.
- `app/previewServer.ts` serves the prototype screen on a loopback-only preview server.
- `app/desktopApiClient.ts` and `app/appController.ts` define the screen-to-local-API flow for validation and solving.
- `app/appRuntime.ts` starts and stops the local API automatically for the future packaged app.
- `app/appShellServer.ts` serves the first runtime-backed local app shell on loopback.
- `app/linuxLauncher.ts` starts the app shell and opens the browser for the Linux prototype.
- `exports/exportWorkbook.ts` builds a shared export workbook model for future Excel/PDF output.
- `exports/xlsxWriter.ts` renders the first real `.xlsx` workbook.
- `exports/printHtmlWriter.ts` renders print-oriented HTML for the PDF path.
- `exports/pdfRenderer.ts` and `exports/nodePdfRuntime.ts` render print HTML into PDF through Chrome.
- `exports/exportFileWriter.ts` and `exports/nodeExportRuntime.ts` provide the first local file export path.
- `storage/jsonDocumentStore.ts` and `storage/nodeDocumentStore.ts` provide app-managed save, load, and backup paths.
- A Linux x64 solver executable has been built under `packaging/resources/solver/linux-x64/`.
- The Linux executable can be invoked through `BundledSolverRunner`.
