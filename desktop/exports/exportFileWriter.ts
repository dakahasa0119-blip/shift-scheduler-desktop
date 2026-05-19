import { buildAppViewModelFromDocument } from "../app/appViewModel";
import type { MonthlyScheduleDocument } from "../core/domain";
import { buildExportWorkbook, renderWorkbookAsTsv } from "./exportWorkbook";
import { renderWorkbookAsXlsx } from "./xlsxWriter";
import { renderWorkbookAsPrintHtml } from "./printHtmlWriter";
import type { PdfRenderer } from "./pdfRenderer";

export interface ExportFileWriter {
  writeText(path: string, content: string): Promise<void>;
}

export interface ExportBinaryFileWriter extends ExportFileWriter {
  writeBinary(path: string, content: Uint8Array): Promise<void>;
}

export interface ExportPathProvider {
  defaultExcelPath(document: MonthlyScheduleDocument): string;
  defaultPdfPath?(document: MonthlyScheduleDocument): string;
}

export interface ExportExcelOptions {
  document: MonthlyScheduleDocument;
  destinationPath?: string;
  writer: ExportFileWriter;
  paths: ExportPathProvider;
}

export interface ExportExcelResult {
  filePath: string;
  format: "tsv" | "xlsx";
}

export async function exportExcelLikeTsv(options: ExportExcelOptions): Promise<ExportExcelResult> {
  const viewModel = buildAppViewModelFromDocument(options.document);
  const workbook = buildExportWorkbook(viewModel);
  const filePath = options.destinationPath || options.paths.defaultExcelPath(options.document);
  await options.writer.writeText(filePath, renderWorkbookAsTsv(workbook));
  return {
    filePath,
    format: "tsv",
  };
}

export async function exportExcelWorkbook(options: Omit<ExportExcelOptions, "writer"> & { writer: ExportBinaryFileWriter }): Promise<ExportExcelResult> {
  const viewModel = buildAppViewModelFromDocument(options.document);
  const workbook = buildExportWorkbook(viewModel);
  const filePath = options.destinationPath || options.paths.defaultExcelPath(options.document);
  await options.writer.writeBinary(filePath, renderWorkbookAsXlsx(workbook));
  return {
    filePath,
    format: "xlsx",
  };
}

export interface ExportPdfOptions {
  document: MonthlyScheduleDocument;
  destinationPath?: string;
  writer: ExportFileWriter;
  paths: ExportPathProvider;
}

export interface ExportPdfResult {
  filePath: string;
  format: "print-html" | "pdf";
}

export async function exportPdfPrintHtml(options: ExportPdfOptions): Promise<ExportPdfResult> {
  const viewModel = buildAppViewModelFromDocument(options.document);
  const workbook = buildExportWorkbook(viewModel);
  const filePath = resolvePrintHtmlPath(options);
  await options.writer.writeText(filePath, renderWorkbookAsPrintHtml(workbook));
  return {
    filePath,
    format: "print-html",
  };
}

export async function exportPdfFile(
  options: ExportPdfOptions & { renderer: PdfRenderer },
): Promise<ExportPdfResult> {
  const viewModel = buildAppViewModelFromDocument(options.document);
  const workbook = buildExportWorkbook(viewModel);
  const html = renderWorkbookAsPrintHtml(workbook);
  const filePath =
    options.destinationPath ||
    options.paths.defaultPdfPath?.(options.document) ||
    options.paths.defaultExcelPath(options.document).replace(/\.xlsx$/i, ".pdf");
  await options.renderer.renderHtmlToPdf({
    html,
    destinationPath: filePath,
  });
  return {
    filePath,
    format: "pdf",
  };
}

function resolvePrintHtmlPath(options: ExportPdfOptions): string {
  const candidate =
    options.destinationPath ||
    options.paths.defaultPdfPath?.(options.document) ||
    options.paths.defaultExcelPath(options.document);
  if (/\.pdf$/i.test(candidate)) return candidate.replace(/\.pdf$/i, ".print.html");
  if (/\.xlsx$/i.test(candidate)) return candidate.replace(/\.xlsx$/i, ".print.html");
  return candidate;
}
