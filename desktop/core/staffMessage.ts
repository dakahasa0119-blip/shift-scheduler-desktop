import type { MonthlyScheduleDocument } from "./domain";

export function renderStaffScheduleMessages(document: MonthlyScheduleDocument): string {
  const daysInMonth = new Date(document.year, document.month, 0).getDate();
  const lines: string[] = [
    `【${document.month}月 個人別シフト一覧】`,
    "(以下をコピーして、各スタッフに送信してください)",
    "",
  ];

  document.schedule.forEach((row) => {
    if (!row.name) return;
    lines.push(`お疲れ様です。${document.month}月のシフトをお知らせします。`);
    lines.push(`■ ${row.name}さんのシフト ■`);
    for (let day = 1; day <= daysInMonth; day++) {
      lines.push(`${document.month}/${day}: ${row.shifts[day - 1] || "休"}`);
    }
    lines.push("--------------------");
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

