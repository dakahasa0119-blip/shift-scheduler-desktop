import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse } from "../app/appViewModel";
import { renderAppPreviewMarkdown } from "../app/markdownPreview";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const response = await handleSolveSchedule(
    {
      document: sampleMonthlyScheduleDocument,
      options: {
        mode: "create",
        timeLimitSeconds: 10,
      },
    },
    {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver: new MockSolverRunner(),
    },
  );
  const viewModel = buildAppViewModelFromSolveResponse(sampleMonthlyScheduleDocument, response);
  const markdown = renderAppPreviewMarkdown(viewModel);

  assertIncludes(markdown, "# 勤務表作成", "title");
  assertIncludes(markdown, "状態: 作成できました（確認事項あり）", "status");
  assertIncludes(markdown, "## 確認事項", "diagnostics");
  assertIncludes(markdown, "6/3 遅 1名不足", "shortage");
  assertIncludes(markdown, "| 職種 | 氏名 | 1 | 2 | 3 |", "schedule header");
  assertIncludes(markdown, "| 介護リーダー | 江藤 | 早 | 夜 | 明 |", "schedule row");
  assertIncludes(markdown, "- Excel出力: 使用可", "export action");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
