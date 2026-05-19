import type { MonthlyScheduleDocument } from "../core/domain";
import type { ExportBinaryFileWriter, ExportPathProvider } from "./exportFileWriter";

declare const require: (name: string) => any;

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

export class NodeExportFileWriter implements ExportBinaryFileWriter {
  async writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }

  async writeBinary(filePath: string, content: Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
}

export class NodeExportPathProvider implements ExportPathProvider {
  constructor(private readonly baseDirectory: string = path.join(os.tmpdir(), "shift-desktop", "exports")) {}

  defaultExcelPath(document: MonthlyScheduleDocument): string {
    const fileName = `${document.year}-${pad(document.month)}-schedule.xlsx`;
    return path.join(this.baseDirectory, fileName);
  }

  defaultPdfPath(document: MonthlyScheduleDocument): string {
    const fileName = `${document.year}-${pad(document.month)}-schedule.pdf`;
    return path.join(this.baseDirectory, fileName);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
