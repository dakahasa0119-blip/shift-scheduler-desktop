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
import { convertGasSolverInputToDocument, isGasSolverInputPayload } from "../core/gasImport";

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
      const document = isGasSolverInputPayload(payload)
        ? convertGasSolverInputToDocument(payload)
        : (payload as MonthlyScheduleDocument);
      this.state = {
        document,
        viewModel: {
          ...buildAppViewModelFromDocument(document),
          status: { label: isGasSolverInputPayload(payload) ? "GASデータを取り込みました" : "JSONを反映しました", tone: "ready" },
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
