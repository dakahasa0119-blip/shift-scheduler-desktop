import type { DesktopApiClient } from "./desktopApiClient";
import type { AppViewModel } from "./appViewModel";
import {
  buildAppViewModelFromDocument,
  buildAppViewModelFromRecoverResponse,
  buildAppViewModelFromSolveResponse,
  buildAppViewModelFromValidateResponse,
  buildInitialAppViewModel,
} from "./appViewModel";
import type { MonthlyScheduleDocument } from "../core/domain";
import { applyScheduleTsv } from "../core/scheduleTsv";
import { applyRequestsTsv, applyStaffTsv } from "../core/inputTsv";
import { parseUrgentLeaveTsv } from "../core/recoveryTsv";
import { convertGasSolverInputToDocument, extractGasSolverInputPayload } from "../core/gasImport";
import {
  addLeaveRequest,
  applyActualScheduleTsv,
  cancelPlannedLeaveRequest,
  cancelUrgentLeave,
  createOrRefreshActualSchedule,
  ensureChangeHistory,
  type CancelByIndexInput,
  type LeaveRequestInput,
} from "../core/operationalRecords";

export interface ScheduleSettingsInput {
  year?: number;
  month?: number;
  requirements?: {
    early?: number;
    day?: number;
    late?: number;
    night?: number;
  };
}

export interface AppControllerState {
  document: MonthlyScheduleDocument;
  viewModel: AppViewModel;
  busy: boolean;
  lastError: string;
}

export class AppController {
  private state: AppControllerState;

  constructor(
    document: MonthlyScheduleDocument,
    private readonly api: Pick<
      DesktopApiClient,
      "validateSchedule" | "solveSchedule" | "exportExcel" | "exportPdf" | "saveDocument" | "loadDocument" | "backupDocument"
      | "recoverSchedule"
    >,
  ) {
    this.state = {
      document,
      viewModel: buildInitialAppViewModel(document),
      busy: false,
      lastError: "",
    };
  }

  getState(): AppControllerState {
    return this.state;
  }

  async validate(): Promise<AppControllerState> {
    return this.run(async () => {
      const response = await this.api.validateSchedule({
        document: this.state.document,
      });
      return {
        ...this.state,
        viewModel: buildAppViewModelFromValidateResponse(this.state.document, response),
        lastError: response.ok ? "" : response.userMessage,
      };
    });
  }

  runMonthlyTransitionPrecheck(): AppControllerState {
    const blockers: string[] = [];
    const warnings: string[] = [];
    if (!this.state.document.year || !this.state.document.month) blockers.push("対象年月が未設定");
    if (!this.state.document.staff.length) blockers.push("職員が未登録");
    if (!this.state.document.schedule.length) blockers.push("勤務表が未作成");
    const activeScheduleRows = this.state.document.schedule.filter((row) => row.name && row.shifts.some(Boolean));
    if (!activeScheduleRows.length) warnings.push("勤務が入力された職員行がありません");
    const diagnostics = this.state.document.diagnostics;
    if (diagnostics) {
      if (diagnostics.summary.requiredFixCount > 0) blockers.push(`修正必須 ${diagnostics.summary.requiredFixCount}件`);
      if (diagnostics.summary.blockingShortageCount > 0) blockers.push(`停止対象不足 ${diagnostics.summary.blockingShortageCount}件`);
      if (diagnostics.summary.unmetLeaveRequestCount > 0) blockers.push(`休暇未充足 ${diagnostics.summary.unmetLeaveRequestCount}件`);
      if (diagnostics.summary.allowedShortageCount > 0) warnings.push(`許容内不足 ${diagnostics.summary.allowedShortageCount}件`);
      if (diagnostics.summary.unmetShiftRequestCount > 0) warnings.push(`勤務希望未充足 ${diagnostics.summary.unmetShiftRequestCount}件`);
    } else {
      warnings.push("勤務表作成後の診断がありません");
    }
    const label = blockers.length
      ? `月次切替前チェック: NG（${blockers.slice(0, 2).join(" / ")}）`
      : warnings.length
        ? `月次切替前チェック: 確認あり（${warnings.slice(0, 2).join(" / ")}）`
        : "月次切替前チェック: OK";
    this.state = {
      ...this.state,
      busy: false,
      lastError: blockers.join(" / "),
      viewModel: {
        ...buildAppViewModelFromDocument(this.state.document),
        status: {
          label,
          tone: blockers.length ? "blocked" : warnings.length ? "warning" : "ready",
        },
      },
    };
    return this.state;
  }

  async solve(): Promise<AppControllerState> {
    return this.run(async () => {
      const response = await this.api.solveSchedule({
        document: this.state.document,
        options: {
          mode: "create",
          timeLimitSeconds: 120,
        },
      });
      const nextDocument = response.ok ? response.document : this.state.document;
      return {
        ...this.state,
        document: nextDocument,
        viewModel: buildAppViewModelFromSolveResponse(this.state.document, response),
        lastError: response.ok ? "" : response.userMessage,
      };
    });
  }

  async recover(urgentLeaveText: string, fixedThroughDate?: string): Promise<AppControllerState> {
    return this.run(async () => {
      const urgentLeaves = parseUrgentLeaveTsv(
        urgentLeaveText,
        this.state.document.staff,
        this.state.document.year,
        this.state.document.month,
      );
      const response = await this.api.recoverSchedule({
        document: this.state.document,
        urgentLeaves,
        options: {
          fixedThroughDate: fixedThroughDate || undefined,
          timeLimitSeconds: 120,
        },
      });
      const nextDocument = response.ok ? response.document : this.state.document;
      return {
        ...this.state,
        document: nextDocument,
        viewModel: buildAppViewModelFromRecoverResponse(this.state.document, response),
        lastError: response.ok ? "" : response.userMessage,
      };
    });
  }

  createActualSchedule(): AppControllerState {
    const document = createOrRefreshActualSchedule(this.state.document);
    this.state = {
      document,
      viewModel: {
        ...buildAppViewModelFromDocument(document),
        status: { label: "勤務実績を作成 / 更新しました", tone: "ready" },
      },
      busy: false,
      lastError: "",
    };
    return this.state;
  }

  ensureHistory(): AppControllerState {
    const document = ensureChangeHistory(this.state.document);
    this.state = {
      document,
      viewModel: {
        ...buildAppViewModelFromDocument(document),
        status: { label: "変更履歴を確認しました", tone: "ready" },
      },
      busy: false,
      lastError: "",
    };
    return this.state;
  }

  addLeaveRequest(input: LeaveRequestInput): AppControllerState {
    try {
      const document = addLeaveRequest(this.state.document, input);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "休暇・希望勤務を登録しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        busy: false,
        lastError: message,
        viewModel: {
          ...this.state.viewModel,
          status: { label: message, tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  cancelPlannedLeave(input: CancelByIndexInput): AppControllerState {
    try {
      const document = cancelPlannedLeaveRequest(this.state.document, input);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "事前休暇を取り消しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        busy: false,
        lastError: message,
        viewModel: {
          ...this.state.viewModel,
          status: { label: message, tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  cancelUrgentLeave(input: CancelByIndexInput): AppControllerState {
    try {
      const document = cancelUrgentLeave(this.state.document, input);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "急遽休を取り消しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        busy: false,
        lastError: message,
        viewModel: {
          ...this.state.viewModel,
          status: { label: message, tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  async save(): Promise<AppControllerState> {
    return this.run(async () => {
      const response = await this.api.saveDocument({
        document: this.state.document,
      });
      return {
        ...this.state,
        viewModel: {
          ...this.state.viewModel,
          status: response.ok
            ? { label: "保存しました", tone: "ready" }
            : { label: response.userMessage, tone: "blocked" },
        },
        lastError: response.ok ? "" : response.userMessage,
      };
    });
  }

  async load(): Promise<AppControllerState> {
    return this.run(async () => {
      const response = await this.api.loadDocument();
      if (!response.ok) {
        return {
          ...this.state,
          viewModel: {
            ...this.state.viewModel,
            status: { label: response.userMessage, tone: "blocked" },
          },
          lastError: response.userMessage,
        };
      }
      return {
        document: response.document,
        viewModel: {
          ...buildAppViewModelFromDocument(response.document),
          status: { label: "読込しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    });
  }

  async backup(): Promise<AppControllerState> {
    return this.run(async () => {
      const response = await this.api.backupDocument({
        document: this.state.document,
      });
      return {
        ...this.state,
        viewModel: {
          ...this.state.viewModel,
          status: response.ok
            ? { label: "バックアップしました", tone: "ready" }
            : { label: response.userMessage, tone: "blocked" },
        },
        lastError: response.ok ? "" : response.userMessage,
      };
    });
  }

  importJson(documentText: string): AppControllerState {
    try {
      const payload = JSON.parse(documentText);
      const gasPayload = extractGasSolverInputPayload(payload);
      const document = gasPayload
        ? convertGasSolverInputToDocument(gasPayload)
        : (payload as MonthlyScheduleDocument);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: gasPayload ? "GASデータを取り込みました" : "JSONを反映しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        lastError: error instanceof Error ? error.message : String(error),
        viewModel: {
          ...this.state.viewModel,
          status: { label: "JSONを反映できませんでした", tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  updateSettings(input: unknown): AppControllerState {
    const settings = normalizeSettingsInput(input);
    const document: MonthlyScheduleDocument = {
      ...this.state.document,
      year: settings.year ?? this.state.document.year,
      month: settings.month ?? this.state.document.month,
      requirements: {
        ...this.state.document.requirements,
        early: settings.requirements?.early ?? this.state.document.requirements.early,
        day: settings.requirements?.day ?? this.state.document.requirements.day,
        late: settings.requirements?.late ?? this.state.document.requirements.late,
        night: settings.requirements?.night ?? this.state.document.requirements.night,
      },
      diagnostics: null,
    };
    this.state = {
      document,
      viewModel: {
        ...buildAppViewModelFromDocument(document),
        status: { label: "設定を反映しました", tone: "ready" },
      },
      busy: false,
      lastError: "",
    };
    return this.state;
  }

  importScheduleTsv(scheduleText: string): AppControllerState {
    try {
      const document = applyScheduleTsv(this.state.document, scheduleText);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "勤務表TSVを反映しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        lastError: error instanceof Error ? error.message : String(error),
        viewModel: {
          ...this.state.viewModel,
          status: { label: "勤務表TSVを反映できませんでした", tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  importActualScheduleTsv(actualScheduleText: string): AppControllerState {
    try {
      const document = applyActualScheduleTsv(this.state.document, actualScheduleText);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "勤務実績TSVを反映しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        lastError: error instanceof Error ? error.message : String(error),
        viewModel: {
          ...this.state.viewModel,
          status: { label: "勤務実績TSVを反映できませんでした", tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  importStaffTsv(staffText: string): AppControllerState {
    try {
      const document = applyStaffTsv(this.state.document, staffText);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "職員一覧を反映しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        lastError: error instanceof Error ? error.message : String(error),
        viewModel: {
          ...this.state.viewModel,
          status: { label: "職員一覧を反映できませんでした", tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  importRequestsTsv(requestsText: string): AppControllerState {
    try {
      const document = applyRequestsTsv(this.state.document, requestsText);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: "希望休・希望勤務を反映しました", tone: "ready" },
        },
        busy: false,
        lastError: "",
      };
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        lastError: error instanceof Error ? error.message : String(error),
        viewModel: {
          ...this.state.viewModel,
          status: { label: "希望休・希望勤務を反映できませんでした", tone: "blocked" },
        },
      };
    }
    return this.state;
  }

  updateDocument(document: MonthlyScheduleDocument): AppControllerState {
    this.state = {
      document,
      viewModel: buildInitialAppViewModel(document),
      busy: false,
      lastError: "",
    };
    return this.state;
  }

  exportExcel(): ReturnType<DesktopApiClient["exportExcel"]> {
    return this.api.exportExcel({
      document: this.state.document,
    });
  }

  exportPdf(): ReturnType<DesktopApiClient["exportPdf"]> {
    return this.api.exportPdf({
      document: this.state.document,
    });
  }

  private async run(operation: () => Promise<AppControllerState>): Promise<AppControllerState> {
    this.state = {
      ...this.state,
      busy: true,
      viewModel: {
        ...this.state.viewModel,
        status: {
          label: "処理中です",
          tone: "working",
        },
      },
    };

    try {
      const nextState = await operation();
      this.state = {
        ...nextState,
        busy: false,
      };
      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        busy: false,
        lastError: message,
        viewModel: {
          ...this.state.viewModel,
          status: {
            label: "アプリ内部で問題が発生しました",
            tone: "blocked",
          },
        },
      };
      return this.state;
    }
  }
}

function normalizeSettingsInput(input: unknown): ScheduleSettingsInput {
  const value = (input || {}) as ScheduleSettingsInput;
  return {
    year: normalizeInteger(value.year, 2000, 2100),
    month: normalizeInteger(value.month, 1, 12),
    requirements: {
      early: normalizeInteger(value.requirements?.early, 0, 20),
      day: normalizeInteger(value.requirements?.day, 0, 20),
      late: normalizeInteger(value.requirements?.late, 0, 20),
      night: normalizeInteger(value.requirements?.night, 0, 20),
    },
  };
}

function normalizeInteger(value: unknown, min: number, max: number): number | undefined {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return undefined;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}
