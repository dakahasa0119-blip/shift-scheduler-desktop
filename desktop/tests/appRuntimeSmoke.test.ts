import { DesktopAppRuntime } from "../app/appRuntime";

declare const require: (name: string) => any;

const fs = require("node:fs");
const path = require("node:path");

async function main(): Promise<void> {
  const executablePath = path.resolve("desktop/packaging/resources/solver/linux-x64/shift-solver");
  if (!fs.existsSync(executablePath)) {
    console.log("skip: linux bundled solver artifact does not exist");
    return;
  }

  const runtime = new DesktopAppRuntime({
    appVersion: "0.1.0-smoke",
    now: () => new Date(2026, 4, 19, 20, 0, 0),
    platform: "linux-x64",
    defaultTimeLimitSeconds: 10,
  });

  const started = await runtime.start();
  try {
    assertEqual(started.status, "ready", "runtime started");
    assertTrue(started.apiUrl.startsWith("http://127.0.0.1:"), "runtime url");
    const health = await runtime.getClient().health();
    assertEqual(health.ok, true, "health ok");
    assertEqual(health.version, "0.1.0-smoke", "health version");
  } finally {
    const stopped = await runtime.stop();
    assertEqual(stopped.status, "stopped", "runtime stopped");
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
