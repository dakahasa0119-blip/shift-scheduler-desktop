import type { MonthlyScheduleDocument } from "../core/domain";
import { validateMonthlyScheduleDocument } from "../core/validation";

export interface DocumentStore {
  save(document: MonthlyScheduleDocument): Promise<DocumentStoreResult>;
  load(): Promise<DocumentStoreLoadResult>;
  backup(document: MonthlyScheduleDocument): Promise<DocumentStoreResult>;
}

export interface DocumentStoreResult {
  filePath: string;
}

export interface DocumentStoreLoadResult {
  filePath: string;
  document: MonthlyScheduleDocument;
}

export interface JsonDocumentStoreFileSystem {
  ensureDirectory(path: string): Promise<void>;
  writeText(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export interface JsonDocumentStoreClock {
  now(): Date;
}

export interface JsonDocumentStoreOptions {
  directory: string;
  files: JsonDocumentStoreFileSystem;
  clock: JsonDocumentStoreClock;
}

export class JsonDocumentStore implements DocumentStore {
  constructor(private readonly options: JsonDocumentStoreOptions) {}

  async save(document: MonthlyScheduleDocument): Promise<DocumentStoreResult> {
    const filePath = this.currentPath();
    await this.writeDocument(filePath, document);
    return { filePath };
  }

  async load(): Promise<DocumentStoreLoadResult> {
    const filePath = this.currentPath();
    if (!(await this.options.files.exists(filePath))) {
      throw new Error(`saved document not found: ${filePath}`);
    }
    const document = JSON.parse(await this.options.files.readText(filePath)) as MonthlyScheduleDocument;
    const validation = validateMonthlyScheduleDocument(document);
    if (!validation.ok) {
      throw new Error("saved document is invalid");
    }
    return { filePath, document };
  }

  async backup(document: MonthlyScheduleDocument): Promise<DocumentStoreResult> {
    const filePath = `${this.options.directory.replace(/\/+$/, "")}/backup-${formatTimestamp(this.options.clock.now())}.json`;
    await this.writeDocument(filePath, document);
    return { filePath };
  }

  private async writeDocument(filePath: string, document: MonthlyScheduleDocument): Promise<void> {
    const validation = validateMonthlyScheduleDocument(document);
    if (!validation.ok) {
      throw new Error("document is invalid");
    }
    await this.options.files.ensureDirectory(this.options.directory);
    await this.options.files.writeText(filePath, `${JSON.stringify(document, null, 2)}\n`);
  }

  private currentPath(): string {
    return `${this.options.directory.replace(/\/+$/, "")}/current-schedule.json`;
  }
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}
