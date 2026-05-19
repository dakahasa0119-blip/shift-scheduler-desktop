import { launchLinuxApp } from "../app/linuxLauncher";
import type { AppShellServer, AppShellServerOptions } from "../app/appShellServer";

async function main(): Promise<void> {
  const starter = new FakeShellStarter();
  const opener = new FakeOpener();
  const launcher = await launchLinuxApp({
    port: 45910,
    shellStarter: starter,
    opener,
  });

  assertEqual(launcher.url, "http://127.0.0.1:45910", "launcher url");
  assertEqual(starter.calls.length, 1, "starter call count");
  assertEqual(starter.calls[0].port, 45910, "starter port");
  assertEqual(starter.calls[0].runtimeOptions.appVersion, "0.1.0-linux", "runtime version");
  assertEqual(opener.opened[0], "http://127.0.0.1:45910", "opened url");

  await launcher.close();
  assertEqual(starter.closedCount, 1, "closed count");
}

class FakeShellStarter {
  calls: AppShellServerOptions[] = [];
  closedCount = 0;

  async start(options: AppShellServerOptions): Promise<AppShellServer> {
    this.calls.push(options);
    return {
      host: "127.0.0.1",
      port: options.port || 45910,
      url: `http://127.0.0.1:${options.port || 45910}`,
      close: async () => {
        this.closedCount += 1;
      },
    };
  }
}

class FakeOpener {
  opened: string[] = [];

  async open(url: string): Promise<void> {
    this.opened.push(url);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
