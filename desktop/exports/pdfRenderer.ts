export interface PdfRenderer {
  renderHtmlToPdf(options: RenderHtmlToPdfOptions): Promise<void>;
}

export interface RenderHtmlToPdfOptions {
  html: string;
  destinationPath: string;
}

export interface PdfProcessExecutor {
  run(command: PdfProcessCommand): Promise<PdfProcessResult>;
}

export interface PdfProcessCommand {
  executablePath: string;
  args: string[];
  timeoutMs: number;
}

export interface PdfProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface PdfTempFileProvider {
  createHtmlPath(prefix: string): Promise<string>;
}

export interface PdfFileSystem {
  writeText(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface ChromePdfRendererOptions {
  executablePath: string;
  files: PdfFileSystem;
  tempFiles: PdfTempFileProvider;
  process: PdfProcessExecutor;
  timeoutMs?: number;
}

export class ChromePdfRenderer implements PdfRenderer {
  constructor(private readonly options: ChromePdfRendererOptions) {}

  async renderHtmlToPdf(renderOptions: RenderHtmlToPdfOptions): Promise<void> {
    const htmlPath = await this.options.tempFiles.createHtmlPath("shift-print");
    await this.options.files.writeText(htmlPath, renderOptions.html);
    try {
      const result = await this.options.process.run({
        executablePath: this.options.executablePath,
        args: [
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          `--print-to-pdf=${renderOptions.destinationPath}`,
          htmlPath,
        ],
        timeoutMs: this.options.timeoutMs || 30000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`pdf renderer exited with code ${result.exitCode}: ${result.stderr || result.stdout}`);
      }
    } finally {
      await this.options.files.remove(htmlPath);
    }
  }
}
