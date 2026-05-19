import type { MonthlyScheduleDocument, ScheduleDiagnostics } from "../core/domain";
import type { ValidationIssue } from "../core/validation";

export interface ApiErrorResponse {
  ok: false;
  code: ApiErrorCode;
  message: string;
  userMessage: string;
  details?: unknown;
}

export type ApiErrorCode =
  | "validation_failed"
  | "solver_failed"
  | "solver_infeasible"
  | "export_failed"
  | "storage_failed"
  | "internal_error";

export interface HealthResponse {
  ok: true;
  status: "ready";
  app: "shift-desktop-local-api";
  version: string;
}

export interface ValidateScheduleRequest {
  document: MonthlyScheduleDocument;
}

export interface ValidateScheduleSuccessResponse {
  ok: true;
  validation: {
    ok: boolean;
    issues: ValidationIssue[];
  };
}

export type ValidateScheduleResponse = ValidateScheduleSuccessResponse | ApiErrorResponse;

export interface SolveScheduleRequest {
  document: MonthlyScheduleDocument;
  options?: SolveScheduleOptions;
}

export interface SolveScheduleOptions {
  timeLimitSeconds?: number;
  mode?: "create" | "recreate";
}

export interface SolveScheduleSuccessResponse {
  ok: true;
  document: MonthlyScheduleDocument;
  diagnostics: ScheduleDiagnostics;
  messages: string[];
}

export type SolveScheduleResponse = SolveScheduleSuccessResponse | ApiErrorResponse;

export interface RecoverScheduleRequest {
  document: MonthlyScheduleDocument;
  urgentLeaves: UrgentLeaveInput[];
  options?: RecoverScheduleOptions;
}

export interface UrgentLeaveInput {
  staffId: string;
  date: string;
  reason: "急休" | "欠勤" | "その他";
  notes?: string;
}

export interface RecoverScheduleOptions {
  fixedThroughDate?: string;
  timeLimitSeconds?: number;
}

export interface RecoverScheduleSuccessResponse {
  ok: true;
  document: MonthlyScheduleDocument;
  diagnostics: ScheduleDiagnostics;
  messages: string[];
  diffs: ScheduleDiff[];
}

export interface ScheduleDiff {
  date: string;
  staffId: string;
  name: string;
  before: string;
  after: string;
  labels: string[];
}

export type RecoverScheduleResponse = RecoverScheduleSuccessResponse | ApiErrorResponse;

export interface ExportExcelRequest {
  document: MonthlyScheduleDocument;
  destinationPath?: string;
}

export interface ExportExcelSuccessResponse {
  ok: true;
  filePath: string;
}

export type ExportExcelResponse = ExportExcelSuccessResponse | ApiErrorResponse;

export interface ExportPdfRequest {
  document: MonthlyScheduleDocument;
  destinationPath?: string;
}

export interface ExportPdfSuccessResponse {
  ok: true;
  filePath: string;
  format: "print-html" | "pdf";
}

export type ExportPdfResponse = ExportPdfSuccessResponse | ApiErrorResponse;

export interface SaveDocumentRequest {
  document: MonthlyScheduleDocument;
}

export interface SaveDocumentSuccessResponse {
  ok: true;
  filePath: string;
}

export type SaveDocumentResponse = SaveDocumentSuccessResponse | ApiErrorResponse;

export interface LoadDocumentSuccessResponse {
  ok: true;
  document: MonthlyScheduleDocument;
  filePath: string;
}

export type LoadDocumentResponse = LoadDocumentSuccessResponse | ApiErrorResponse;

export interface BackupDocumentRequest {
  document: MonthlyScheduleDocument;
}

export interface BackupDocumentSuccessResponse {
  ok: true;
  filePath: string;
}

export type BackupDocumentResponse = BackupDocumentSuccessResponse | ApiErrorResponse;
