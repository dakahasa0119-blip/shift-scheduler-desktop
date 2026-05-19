import { startAppShellServer, type AppShellServer, type AppShellServerOptions } from "./appShellServer";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  on(event: string, listener: () => void): void;
  exitCode?: number;
};

const childProcess = require("node:child_process");

export interface LinuxLauncherOptions {
  port?: number;
  opener?: UrlOpener;
  shellStarter?: AppShellStarter;
}

export interface UrlOpener {
  open(url: string): Promise<void>;
}

export interface AppShellStarter {
  start(options: AppShellServerOptions): Promise<AppShellServer>;
}

export interface LinuxLauncherResult {
  url: string;
  close(): Promise<void>;
}

export async function launchLinuxApp(options: LinuxLauncherOptions = {}): Promise<LinuxLauncherResult> {
  const starter = options.shellStarter || defaultShellStarter;
  const server = await starter.start({
    port: options.port,
    runtimeOptions: {
      appVersion: "0.1.0-linux",
      defaultTimeLimitSeconds: 10,
    },
  });
  const opener = options.opener || new XdgUrlOpener();
  await opener.open(server.url);
  return {
    url: server.url,
    close: () => server.close(),
  };
}

export class XdgUrlOpener implements UrlOpener {
  async open(url: string): Promise<void> {
    if (process.env.SHIFT_DESKTOP_NO_OPEN === "1") return;
    await new Promise<void>((resolve) => {
      const child = childProcess.spawn("xdg-open", [url], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => resolve());
      child.on("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
}

async function main(): Promise<void> {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.replace("--port=", "")) : Number(process.env.PORT || 0);
  const launcher = await launchLinuxApp({
    port: Number.isFinite(port) && port > 0 ? port : undefined,
  });
  console.log(`desktop app: ${launcher.url}`);

  const close = () => {
    launcher.close().catch(() => {});
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

const defaultShellStarter: AppShellStarter = {
  start: startAppShellServer,
};

if (process.argv.some((arg) => arg.endsWith("desktop/app/linuxLauncher.ts") || arg.endsWith("linuxLauncher.ts"))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
