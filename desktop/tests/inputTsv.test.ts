import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import { applyRequestsTsv, applyStaffTsv, renderRequestsTsv, renderStaffTsv } from "../core/inputTsv";

function main(): void {
  const staffTsv = renderStaffTsv(sampleMonthlyScheduleDocument);
  assertIncludes(staffTsv, "氏名\t職種\t性別", "staff header");
  assertIncludes(staffTsv, "江藤", "staff body");

  const staffUpdated = applyStaffTsv(sampleMonthlyScheduleDocument, staffTsv.replace("介護リーダー", "主任"));
  assertEqual(staffUpdated.staff[0].role, "主任", "staff role updated");
  assertEqual(staffUpdated.schedule[0].role, "主任", "schedule role follows staff");

  const requestsTsv = renderRequestsTsv(sampleMonthlyScheduleDocument);
  assertIncludes(requestsTsv, "氏名\t区分\t開始日\t終了日\t備考", "request header");
  const requestsUpdated = applyRequestsTsv(sampleMonthlyScheduleDocument, "氏名\t区分\t開始日\t終了日\t備考\n江藤\t希望夜勤\t2026-06-10\t2026-06-10\t確認\n");
  assertEqual(requestsUpdated.requests.length, 1, "request count");
  assertEqual(requestsUpdated.requests[0].type, "希望夜勤", "request type");
  assertEqual(requestsUpdated.requests[0].notes, "確認", "request notes");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
