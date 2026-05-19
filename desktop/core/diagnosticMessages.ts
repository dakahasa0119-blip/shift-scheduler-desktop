import type {
  CorrectionSuggestion,
  ScheduleDiagnostics,
  ShortageDiagnostic,
  UnmetRequestDiagnostic,
} from "./domain";

export function buildUserFacingDiagnosticMessages(diagnostics: ScheduleDiagnostics): string[] {
  const lines: string[] = [];
  const summary = diagnostics.summary;
  const hasNotes =
    summary.allowedShortageCount > 0 ||
    summary.unmetShiftRequestCount > 0 ||
    diagnostics.suggestions.length > 0;

  if (summary.canUse) {
    lines.push(hasNotes ? "結果: 作成できました（確認事項あり）" : "結果: 作成できました");
  } else {
    lines.push("結果: 作成を止めました（修正が必要です）");
  }

  lines.push("確認事項: " + buildIssueSummary(diagnostics));

  diagnostics.shortages.slice(0, 5).forEach((item) => {
    lines.push(formatShortage(item));
  });

  diagnostics.unmetRequests.slice(0, 5).forEach((item) => {
    lines.push(formatUnmetRequest(item));
  });

  diagnostics.suggestions.slice(0, 5).forEach((item) => {
    lines.push(formatSuggestion(item));
  });

  return lines;
}

function buildIssueSummary(diagnostics: ScheduleDiagnostics): string {
  const summary = diagnostics.summary;
  const parts: string[] = [];
  if (summary.requiredFixCount > 0) parts.push(`修正必須 ${summary.requiredFixCount}件`);
  if (summary.blockingShortageCount > 0) parts.push(`停止対象の不足 ${summary.blockingShortageCount}件`);
  if (summary.allowedShortageCount > 0) parts.push(`許容内の不足 ${summary.allowedShortageCount}件`);
  if (summary.unmetLeaveRequestCount > 0) parts.push(`休暇未充足 ${summary.unmetLeaveRequestCount}件`);
  if (summary.unmetShiftRequestCount > 0) parts.push(`勤務希望未充足 ${summary.unmetShiftRequestCount}件`);
  return parts.length ? parts.join(" / ") : "なし";
}

function formatShortage(item: ShortageDiagnostic): string {
  const state = item.allowed ? "許容内" : "要対応";
  const reasonText = item.reasons.length ? ` - ${item.reasons.join(", ")}` : "";
  return `不足: ${item.date} ${item.shift} ${item.count}名（${state}）${reasonText}`;
}

function formatUnmetRequest(item: UnmetRequestDiagnostic): string {
  const label = item.blocking ? "休暇希望" : "勤務希望";
  return `${label}: ${item.date} ${item.name} ${item.type} → ${item.assignedShift || "空欄"}（未充足）`;
}

function formatSuggestion(item: CorrectionSuggestion): string {
  const suffix = item.remainingIssueSummary ? `（${item.remainingIssueSummary}）` : "";
  return `対応候補: ${item.target} ${item.message}${suffix}`;
}
