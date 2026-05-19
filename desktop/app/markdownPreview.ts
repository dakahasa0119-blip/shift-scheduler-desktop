import type { AppViewModel } from "./appViewModel";

export function renderAppPreviewMarkdown(viewModel: AppViewModel): string {
  const lines: string[] = [];
  lines.push(`# ${viewModel.title}`);
  lines.push("");
  lines.push(`状態: ${viewModel.status.label}`);
  lines.push("");

  if (viewModel.validationIssues.length > 0) {
    lines.push("## 入力確認");
    viewModel.validationIssues.forEach((issue) => {
      lines.push(`- ${issue.severity === "error" ? "修正" : "確認"}: ${issue.path} ${issue.message}`);
    });
    lines.push("");
  }

  if (viewModel.diagnostics) {
    lines.push("## 確認事項");
    viewModel.diagnostics.sections.forEach((section) => {
      lines.push(`### ${section.title}`);
      section.items.forEach((item) => {
        lines.push(`- ${item.primary}${item.secondary ? `: ${item.secondary}` : ""}`);
      });
      lines.push("");
    });
  }

  lines.push("## 勤務表");
  lines.push(renderScheduleTable(viewModel));
  lines.push("");
  lines.push("## 操作");
  viewModel.actions.forEach((action) => {
    lines.push(`- ${action.label}: ${action.enabled ? "使用可" : "使用不可"}`);
  });
  lines.push("");

  return lines.join("\n");
}

function renderScheduleTable(viewModel: AppViewModel): string {
  const days = viewModel.schedule.days;
  const header = ["職種", "氏名", ...days.map((day) => String(day.day))];
  const weekdays = ["", "", ...days.map((day) => day.weekday)];
  const rows = viewModel.schedule.rows.map((row) => [
    row.role,
    row.name,
    ...row.cells.map((cell) => cell.shift || ""),
  ]);

  return [
    renderMarkdownTableRow(header),
    renderMarkdownTableRow(header.map(() => "---")),
    renderMarkdownTableRow(weekdays),
    ...rows.map(renderMarkdownTableRow),
  ].join("\n");
}

function renderMarkdownTableRow(values: string[]): string {
  return `| ${values.map(escapeCell).join(" | ")} |`;
}

function escapeCell(value: string): string {
  return String(value || "").replace(/\|/g, "\\|");
}
