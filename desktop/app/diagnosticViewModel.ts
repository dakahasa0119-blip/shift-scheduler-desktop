import type { CorrectionSuggestion, ScheduleDiagnostics, ShortageDiagnostic, UnmetRequestDiagnostic } from "../core/domain";

export type DiagnosticSeverity = "ok" | "note" | "warning" | "blocked";

export interface DiagnosticPanelViewModel {
  result: DiagnosticResultViewModel;
  sections: DiagnosticSectionViewModel[];
}

export interface DiagnosticResultViewModel {
  label: string;
  severity: DiagnosticSeverity;
}

export interface DiagnosticSectionViewModel {
  id: "summary" | "requiredFixes" | "shortages" | "unmetRequests" | "suggestions";
  title: string;
  severity: DiagnosticSeverity;
  items: DiagnosticItemViewModel[];
}

export interface DiagnosticItemViewModel {
  primary: string;
  secondary: string;
  severity: DiagnosticSeverity;
}

export function buildDiagnosticPanelViewModel(diagnostics: ScheduleDiagnostics): DiagnosticPanelViewModel {
  return {
    result: buildResult(diagnostics),
    sections: [
      buildSummarySection(diagnostics),
      buildRequiredFixSection(diagnostics),
      buildShortageSection(diagnostics.shortages),
      buildUnmetRequestSection(diagnostics.unmetRequests),
      buildSuggestionSection(diagnostics.suggestions),
    ].filter((section) => section.items.length > 0),
  };
}

function buildResult(diagnostics: ScheduleDiagnostics): DiagnosticResultViewModel {
  if (!diagnostics.summary.canUse) {
    return {
      label: "作成を止めました",
      severity: "blocked",
    };
  }

  const hasNotes =
    diagnostics.summary.allowedShortageCount > 0 ||
    diagnostics.summary.unmetShiftRequestCount > 0 ||
    diagnostics.suggestions.length > 0;

  return {
    label: hasNotes ? "作成できました（確認事項あり）" : "作成できました",
    severity: hasNotes ? "note" : "ok",
  };
}

function buildSummarySection(diagnostics: ScheduleDiagnostics): DiagnosticSectionViewModel {
  const items: DiagnosticItemViewModel[] = [];
  const summary = diagnostics.summary;

  if (summary.requiredFixCount > 0) {
    items.push({
      primary: `修正必須 ${summary.requiredFixCount}件`,
      secondary: "このままでは勤務表として使えない項目です。",
      severity: "blocked",
    });
  }
  if (summary.blockingShortageCount > 0) {
    items.push({
      primary: `停止対象の不足 ${summary.blockingShortageCount}件`,
      secondary: "必要配置を満たせていないため、条件の見直しが必要です。",
      severity: "blocked",
    });
  }
  if (summary.allowedShortageCount > 0) {
    items.push({
      primary: `許容内の不足 ${summary.allowedShortageCount}件`,
      secondary: "運用上は許容されていますが、確認しておく不足です。",
      severity: "note",
    });
  }
  if (summary.unmetLeaveRequestCount > 0) {
    items.push({
      primary: `休暇未充足 ${summary.unmetLeaveRequestCount}件`,
      secondary: "希望休や休暇が満たせていないため、優先して確認してください。",
      severity: "blocked",
    });
  }
  if (summary.unmetShiftRequestCount > 0) {
    items.push({
      primary: `勤務希望未充足 ${summary.unmetShiftRequestCount}件`,
      secondary: "勤務希望は満たせない場合があります。必要に応じて確認してください。",
      severity: "note",
    });
  }

  if (items.length === 0) {
    items.push({
      primary: "確認事項なし",
      secondary: "作成結果に追加確認が必要な項目はありません。",
      severity: "ok",
    });
  }

  return {
    id: "summary",
    title: "確認事項",
    severity: highestSeverity(items),
    items,
  };
}

function buildRequiredFixSection(diagnostics: ScheduleDiagnostics): DiagnosticSectionViewModel {
  const items: DiagnosticItemViewModel[] = [];
  const blockingShortages = diagnostics.shortages.filter((item) => !item.allowed);
  const blockingRequests = diagnostics.unmetRequests.filter((item) => item.blocking);

  blockingShortages.forEach((item) => {
    items.push({
      primary: `${item.date} ${item.shift} ${item.count}名不足`,
      secondary: item.reasons.length ? item.reasons.join("、") : "必要配置を満たせていません。",
      severity: "blocked",
    });
  });

  blockingRequests.forEach((item) => {
    items.push({
      primary: `${item.date} ${item.name} ${item.type}`,
      secondary: `割当: ${item.assignedShift || "空欄"}`,
      severity: "blocked",
    });
  });

  return {
    id: "requiredFixes",
    title: "修正が必要",
    severity: "blocked",
    items,
  };
}

function buildShortageSection(shortages: ShortageDiagnostic[]): DiagnosticSectionViewModel {
  const items = shortages.map((item) => ({
    primary: `${item.date} ${item.shift} ${item.count}名不足`,
    secondary: item.allowed
      ? buildSecondaryText("許容内", item.reasons)
      : buildSecondaryText("要対応", item.reasons),
    severity: item.allowed ? ("note" as const) : ("blocked" as const),
  }));

  return {
    id: "shortages",
    title: "不足",
    severity: highestSeverity(items),
    items,
  };
}

function buildUnmetRequestSection(requests: UnmetRequestDiagnostic[]): DiagnosticSectionViewModel {
  const items = requests.map((item) => ({
    primary: `${item.date} ${item.name} ${item.type}`,
    secondary: `割当: ${item.assignedShift || "空欄"}`,
    severity: item.blocking ? ("blocked" as const) : ("note" as const),
  }));

  return {
    id: "unmetRequests",
    title: "希望未充足",
    severity: highestSeverity(items),
    items,
  };
}

function buildSuggestionSection(suggestions: CorrectionSuggestion[]): DiagnosticSectionViewModel {
  const items = suggestions.map((item) => ({
    primary: `${item.priority} ${item.target}`,
    secondary: item.remainingIssueSummary ? `${item.message}（${item.remainingIssueSummary}）` : item.message,
    severity: suggestionSeverity(item.priority),
  }));

  return {
    id: "suggestions",
    title: "対応候補",
    severity: highestSeverity(items),
    items,
  };
}

function buildSecondaryText(prefix: string, reasons: string[]): string {
  return reasons.length ? `${prefix}: ${reasons.join("、")}` : prefix;
}

function suggestionSeverity(priority: CorrectionSuggestion["priority"]): DiagnosticSeverity {
  if (priority === "最優先" || priority === "高") return "warning";
  if (priority === "中") return "note";
  return "ok";
}

function highestSeverity(items: DiagnosticItemViewModel[]): DiagnosticSeverity {
  if (items.some((item) => item.severity === "blocked")) return "blocked";
  if (items.some((item) => item.severity === "warning")) return "warning";
  if (items.some((item) => item.severity === "note")) return "note";
  return "ok";
}
