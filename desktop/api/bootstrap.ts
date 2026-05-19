import { BundledSolverRunner } from "../solver/bundledSolverRunner";
import { initialBundledSolverManifest, resolveBundledSolverRuntimeConfig } from "../solver/manifest";
import {
  detectSolverPlatform,
  NodeSolverFileSystem,
  NodeSolverProcessExecutor,
  NodeSolverTempFileProvider,
} from "../solver/nodeBundledSolverRuntime";
import type { BundledSolverManifest, BundledSolverRuntimeConfig, SolverPlatform } from "../solver/bundledSolverTypes";
import type { BundledSolverLogger } from "../solver/bundledSolverRunner";
import type { ApiLogger } from "./handlers";
import { startLocalApiServer, type LocalApiServer } from "./localServer";
import { NodeExportFileWriter, NodeExportPathProvider } from "../exports/nodeExportRuntime";
import { ChromePdfRenderer } from "../exports/pdfRenderer";
import {
  detectChromeExecutable,
  NodePdfFileSystem,
  NodePdfProcessExecutor,
  NodePdfTempFileProvider,
} from "../exports/nodePdfRuntime";
import { createNodeDocumentStore } from "../storage/nodeDocumentStore";

declare const require: (name: string) => any;

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

export interface DesktopLocalApiOptions {
  appVersion: string;
  now?: () => Date;
  host?: string;
  port?: number;
  resourceRoot?: string;
  workDirectory?: string;
  supportLogDirectory?: string;
  keepDebugFiles?: boolean;
  defaultTimeLimitSeconds?: number;
  platform?: SolverPlatform;
  manifest?: BundledSolverManifest;
  logger?: ApiLogger;
}

export interface DesktopLocalApi {
  server: LocalApiServer;
  solverConfig: BundledSolverRuntimeConfig;
  close(): Promise<void>;
}

export async function startDesktopLocalApi(options: DesktopLocalApiOptions): Promise<DesktopLocalApi> {
  const solverConfig = buildDesktopSolverConfig(options);
  assertExecutableExists(solverConfig.executablePath);

  const solver = new BundledSolverRunner({
    config: solverConfig,
    files: new NodeSolverFileSystem(),
    tempFiles: new NodeSolverTempFileProvider(solverConfig.workDirectory),
    process: new NodeSolverProcessExecutor(),
    logger: toBundledSolverLogger(options.logger),
  });

  const chromePath = detectChromeExecutable();
  const server = await startLocalApiServer({
    host: options.host,
    port: options.port,
    deps: {
      appVersion: options.appVersion,
      now: options.now || (() => new Date()),
      solver,
      exports: {
        writer: new NodeExportFileWriter(),
        paths: new NodeExportPathProvider(),
        pdfRenderer: chromePath
          ? new ChromePdfRenderer({
              executablePath: chromePath,
              files: new NodePdfFileSystem(),
              tempFiles: new NodePdfTempFileProvider(),
              process: new NodePdfProcessExecutor(),
            })
          : undefined,
      },
      storage: createNodeDocumentStore(),
      logger: options.logger,
    },
  });

  return {
    server,
    solverConfig,
    close: () => server.close(),
  };
}

export function buildDesktopSolverConfig(options: DesktopLocalApiOptions): BundledSolverRuntimeConfig {
  const baseRuntimeDirectory = path.join(os.tmpdir(), "shift-desktop");
  return resolveBundledSolverRuntimeConfig({
    manifest: options.manifest || initialBundledSolverManifest,
    platform: options.platform || detectSolverPlatform(),
    resourceRoot: path.resolve(options.resourceRoot || "desktop/packaging/resources"),
    workDirectory: options.workDirectory || path.join(baseRuntimeDirectory, "solver-work"),
    supportLogDirectory: options.supportLogDirectory || path.join(baseRuntimeDirectory, "logs"),
    keepDebugFiles: options.keepDebugFiles ?? false,
    defaultTimeLimitSeconds: options.defaultTimeLimitSeconds || 240,
    joinPath: path.join,
  });
}

function assertExecutableExists(executablePath: string): void {
  if (!fs.existsSync(executablePath)) {
    throw new Error(`bundled solver executable not found: ${executablePath}`);
  }
}

function toBundledSolverLogger(logger: ApiLogger | undefined): BundledSolverLogger | undefined {
  if (!logger) return undefined;
  return {
    info: (message, details) => logger.info?.(message, details),
    error: (message, details) => logger.error(message, details),
  };
}
