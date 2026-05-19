import { renderStaffScheduleMessages } from "../core/staffMessage";
import { createBlankMonthlyScheduleDocument } from "../core/fixtures";

function main(): void {
  const document = createBlankMonthlyScheduleDocument(new Date("2026-06-01T00:00:00"));
  document.year = 2026;
  document.month = 6;
  document.staff = [{ ...document.staff[0], id: "staff-eto", name: "江藤", role: "介護リーダー" }];
  document.schedule = [{ staffId: "staff-eto", role: "介護リーダー", name: "江藤", shifts: ["早", "夜", "明"] }];
  const text = renderStaffScheduleMessages(document);
  assertIncludes(text, "【6月 個人別シフト一覧】", "title");
  assertIncludes(text, "お疲れ様です。6月のシフトをお知らせします。", "message intro");
  assertIncludes(text, "■ 江藤さんのシフト ■", "staff heading");
  assertIncludes(text, "6/1:", "day line");
}

function assertIncludes(actual: string, expected: string, label: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

main();
