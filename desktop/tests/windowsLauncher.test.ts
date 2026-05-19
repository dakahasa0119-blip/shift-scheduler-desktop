import { launchWindowsApp, WindowsUrlOpener } from "../app/windowsLauncher";
import type { AppShellServer, AppShellServerOptions } from "../app/appShellServer";

declare const process: {
  env: Record<string, string | undefined>;
};

async function main(): Promise<void> {
  const opened: string[] = [];
  const launcher = await launchWindowsApp({
    port: 45940,
    opener: {
      async open(url) {
        opened.push(url);
      },
    },
    shellStarter: {
      async start(options: AppShellServerOptions): Promise<AppShellServer> {
        assertEqual(options.port, 45940, "launcher port");
        assertEqual(options.runtimeOptions?.appVersion, "0.1.0-windows", "windows app version");
        return {
          host: "127.0.0.1",
          port: 45940,
          url: "http://127.0.0.1:45940",
          close: async () => {},
        };
      },
    },
  });
  assertEqual(launcher.url, "http://127.0.0.1:45940", "launcher url");
  assertEqual(opened[0], "http://127.0.0.1:45940", "opened url");

  process.env.SHIFT_DESKTOP_NO_OPEN = "1";
  await new WindowsUrlOpener().open("http://127.0.0.1:45941");
  delete process.env.SHIFT_DESKTOP_NO_OPEN;
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
