import type {
  HealthResponse,
  BackupDocumentRequest,
  BackupDocumentResponse,
  ExportExcelRequest,
  ExportExcelResponse,
  ExportPdfRequest,
  ExportPdfResponse,
  LoadDocumentResponse,
  SaveDocumentRequest,
  SaveDocumentResponse,
  SolveScheduleRequest,
  SolveScheduleResponse,
  ValidateScheduleRequest,
  ValidateScheduleResponse,
} from "../api/contracts";

export interface DesktopApiClientTransport {
  request(options: DesktopApiRequestOptions): Promise<DesktopApiResponse>;
}

export interface DesktopApiRequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

export interface DesktopApiResponse {
  statusCode: number;
  body: unknown;
}

export interface DesktopApiClientOptions {
  baseUrl: string;
  transport: DesktopApiClientTransport;
}

export class DesktopApiClient {
  constructor(private readonly options: DesktopApiClientOptions) {}

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>({
      method: "GET",
      path: "/health",
    });
  }

  validateSchedule(request: ValidateScheduleRequest): Promise<ValidateScheduleResponse> {
    return this.request<ValidateScheduleResponse>({
      method: "POST",
      path: "/schedule/validate",
      body: request,
    });
  }

  solveSchedule(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    return this.request<SolveScheduleResponse>({
      method: "POST",
      path: "/schedule/solve",
      body: request,
    });
  }

  exportExcel(request: ExportExcelRequest): Promise<ExportExcelResponse> {
    return this.request<ExportExcelResponse>({
      method: "POST",
      path: "/export/excel",
      body: request,
    });
  }

  exportPdf(request: ExportPdfRequest): Promise<ExportPdfResponse> {
    return this.request<ExportPdfResponse>({
      method: "POST",
      path: "/export/pdf",
      body: request,
    });
  }

  saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResponse> {
    return this.request<SaveDocumentResponse>({
      method: "POST",
      path: "/document/save",
      body: request,
    });
  }

  loadDocument(): Promise<LoadDocumentResponse> {
    return this.request<LoadDocumentResponse>({
      method: "GET",
      path: "/document/load",
    });
  }

  backupDocument(request: BackupDocumentRequest): Promise<BackupDocumentResponse> {
    return this.request<BackupDocumentResponse>({
      method: "POST",
      path: "/document/backup",
      body: request,
    });
  }

  private async request<T>(request: DesktopApiRequestOptions): Promise<T> {
    const response = await this.options.transport.request({
      ...request,
      path: normalizePath(this.options.baseUrl, request.path),
    });

    if (response.statusCode < 200 || response.statusCode >= 500) {
      throw new Error(`local api request failed: ${response.statusCode}`);
    }

    return response.body as T;
  }
}

function normalizePath(baseUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
