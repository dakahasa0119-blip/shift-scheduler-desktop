import type { MonthlyScheduleDocument, StaffMember } from "./domain";
import { initializeOperationMonths, repairCurrentShiftCalendar } from "./monthlyTransition";
import { ensureChangeHistory } from "./operationalRecords";
import { runPostEditRecheck } from "./postEditRecheck";

export const staffDropdownOptions = {
  roles: ["施設長", "介護リーダー", "介護", "夜専", "バイト", "介護部応援", "看護部応援", "看護", "事務", "その他"],
  genders: ["男性", "女性", "不明"],
  employmentTypes: ["常勤", "非常勤", "応援", "バイト"],
  allowedShiftSets: ["早・日・遅・夜", "早・日・遅", "早・日", "日・遅", "日・夜", "早", "日", "遅", "夜"],
  fixedOffs: ["なし", "毎週月曜", "毎週火曜", "毎週水曜", "毎週木曜", "毎週金曜", "毎週土曜", "毎週日曜"],
};

export function setupInitialDocument(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  const initialized = initializeOperationMonths({
    ...document,
    staff: document.staff.map(normalizeStaffDefaults),
    requests: document.requests,
    requirements: {
      ...document.requirements,
      allowedShortageShifts: document.requirements.allowedShortageShifts.length
        ? document.requirements.allowedShortageShifts
        : ["遅"],
      femaleRequiredWeekdays: document.requirements.femaleRequiredWeekdays || [],
    },
  });
  const repaired = repairCurrentShiftCalendar(initialized);
  return runPostEditRecheck(ensureChangeHistory(repaired));
}

export function normalizeStaffListForDropdowns(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  return runPostEditRecheck({
    ...document,
    staff: document.staff.map(normalizeStaffDefaults),
    schedule: document.schedule.map((row) => {
      const staff = document.staff.find((item) => item.id === row.staffId || item.name === row.name);
      return {
        ...row,
        role: staff?.role || row.role || "介護",
      };
    }),
  });
}

function normalizeStaffDefaults(staff: StaffMember): StaffMember {
  return {
    ...staff,
    role: staff.role || "介護",
    gender: staff.gender || "",
    employmentType: staff.employmentType || "",
    allowedShifts: staff.allowedShifts.length ? staff.allowedShifts : ["早", "日", "遅", "夜"],
    allowedWeekdays: staff.allowedWeekdays.length ? staff.allowedWeekdays : [0, 1, 2, 3, 4, 5, 6],
    fixedOffWeekday: staff.fixedOffWeekday ?? null,
    notes: staff.notes || "",
  };
}
