import { DesktopAppRuntime } from "../app/appRuntime";
import type { DesktopLocalApi, DesktopLocalApiOptions } from "../api/bootstrap";
import type { DesktopApiClientTransport, DesktopApiRequestOptions, DesktopApiResponse } from "../app/desktopApiClient";
import type { BundledSolverRuntimeConfig } from "../solver/bundledSolverTypes";

async function main(): Promise<void> {
  const starter = new FakeStarter();
  const runtime = new DesktopAppRuntime({
    appVersion: "0.1.0-test",
    now: () => new Date(2026, 4, 19, 20, 0, 0),
    apiStarter: starter,
    transportFactory: () => new FakeTransport(),
  });

  const started = await runtime.start();
  assertEqual(started.status, "ready", "started status");
  assertEqual(started.apiUrl, "http://127.0.0.1:41000", "api url");
  assertEqual(starter.calls[0].host, "127.0.0.1", "loopback host");
  assertEqual(starter.calls[0].port, undefined, "automatic port");
  assertEqual(runtime.getClient() !== null, true, "client available");

  const secondStart = await runtime.start();
  assertEqual(secondStart.status, "ready", "second start status");
  assertEqual(starter.calls.length, 1, "start is idempotent");

  const restarted = await runtime.restart();
  assertEqual(restarted.status, "ready", "restart status");
  assertEqual(starter.closedCount, 1, "restart closes previous api");
  assertEqual(starter.calls.length, 2, "restart starts again");

  const stopped = await runtime.stop();
  assertEqual(stopped.status, "stopped", "stopped status");
  assertEqual(starter.closedCount, 2, "stop closes api");

  const failedRuntime = new DesktopAppRuntime({
    appVersion: "0.1.0-test",
    apiStarter: {
      async start(): Promise<DesktopLocalApi> {
        throw new Error("solver executable not found");
      },
    },
    transportFactory: () => new FakeTransport(),
  });
  const failed = await failedRuntime.start();
  assertEqual(failed.status, "failed", "failed status");
  assertEqual(failed.apiUrl, "", "failed api url");
  assertEqual(failed.lastError, "solver executable not found", "failed message");
}

class FakeStarter {
  calls: DesktopLocalApiOptions[] = [];
  closedCount = 0;

  async start(options: DesktopLocalApiOptions): Promise<DesktopLocalApi> {
    this.calls.push(options);
    return {
      server: {
        host: "127.0.0.1",
        port: 41000,
        url: "http://127.0.0.1:41000",
        close: async () => {
          this.closedCount += 1;
        },
      },
      solverConfig: {} as BundledSolverRuntimeConfig,
      close: async () => {
        this.closedCount += 1;
      },
    };
  }
}

class FakeTransport implements DesktopApiClientTransport {
  async request(options: DesktopApiRequestOptions): Promise<DesktopApiResponse> {
    if (options.method === "GET" && options.path === "http://127.0.0.1:41000/health") {
      return {
        statusCode: 200,
        body: {
          ok: true,
          status: "ready",
          app: "shift-desktop-local-api",
          version: "0.1.0-test",
        },
      };
    }
    return {
      statusCode: 404,
      body: {
        ok: false,
      },
    };
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
