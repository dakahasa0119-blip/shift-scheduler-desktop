# Export Plan

The desktop version should export human-facing files without depending on Google Sheets.

## Initial Targets

- Excel workbook
- PDF
- CSV for debugging and migration

## Current Prototype

- `exportWorkbook.ts` converts the app view model into a workbook-like structure.
- `xlsxWriter.ts` renders the workbook as a minimal `.xlsx` file without external runtime dependencies.
- `printHtmlWriter.ts` renders the workbook as print-oriented HTML for the PDF path.
- `pdfRenderer.ts` converts print HTML into a PDF through a browser engine boundary.
- `nodePdfRuntime.ts` provides the Node/Chrome runtime implementation.
- `exportFileWriter.ts` writes the workbook as `.xlsx`, while keeping TSV available as a debugging bridge.
- `nodeExportRuntime.ts` provides the Node file writer and default export path provider.
- The workbook keeps schedule rows, role/name columns, day headers, cell tones, request notes, and diagnostic rows.
- The preview server can return an `.xlsx` download from `/preview/export/excel`.
- The preview server can return a PDF from `/preview/export/pdf` when Chrome is available, with print HTML as a fallback.
- The local API can write an `.xlsx` file through `POST /export/excel`.
- The local API can write a PDF through `POST /export/pdf` when a PDF renderer is configured, with print HTML as a fallback.
- TSV remains useful for debugging export content before visual formatting checks.

## Excel Requirements

- Monthly schedule grid
- Staff role next to name
- Day and weekday headers
- Shift colors
- Request/unmet-request notes
- Shortage and recovery notes below the schedule
- Print-friendly layout

## PDF Requirements

- Same visible information as the Excel schedule
- No clipped shift text
- Clear shortage and request notes
- Landscape layout by default

## Non-goals For First Prototype

- Perfect visual parity with the GAS sheet
- Staff-specific distribution text
- Automatic email sending
