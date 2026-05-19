import type { ApiErrorCode, ApiErrorResponse } from "./contracts";

export function buildApiError(
  code: ApiErrorCode,
  message: string,
  userMessage: string,
  details?: unknown,
): ApiErrorResponse {
  return {
    ok: false,
    code,
    message,
    userMessage,
    details,
  };
}

export function validationFailed(details: unknown): ApiErrorResponse {
  return buildApiError(
    "validation_failed",
    "document validation failed",
    "入力内容に確認が必要です。",
    details,
  );
}

export function solverFailed(details?: unknown): ApiErrorResponse {
  return buildApiError(
    "solver_failed",
    "solver process failed",
    "勤務表作成中に問題が発生しました。もう一度実行してください。",
    details,
  );
}

export function solverTimedOut(details?: unknown): ApiErrorResponse {
  return buildApiError(
    "solver_failed",
    "solver timed out",
    "勤務表作成が時間内に終わりませんでした。条件を減らすか、時間をおいて再実行してください。",
    details,
  );
}

export function exportFailed(details?: unknown): ApiErrorResponse {
  return buildApiError(
    "export_failed",
    "export failed",
    "出力に失敗しました。保存先を確認してください。",
    details,
  );
}

export function storageFailed(details?: unknown): ApiErrorResponse {
  return buildApiError(
    "storage_failed",
    "storage failed",
    "保存または読込に失敗しました。アプリを再起動してもう一度実行してください。",
    details,
  );
}

export function internalError(details?: unknown): ApiErrorResponse {
  return buildApiError(
    "internal_error",
    "internal error",
    "アプリ内部で問題が発生しました。再起動してもう一度実行してください。",
    details,
  );
}
