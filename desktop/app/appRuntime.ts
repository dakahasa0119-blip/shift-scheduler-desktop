import { startDesktopLocalApi, type DesktopLocalApi, type DesktopLocalApiOptions } from "../api/bootstrap";
import { DesktopApiClient } from "./desktopApiClient";
import { NodeHttpTransport } from "./nodeHttpTransport";

export interface DesktopAppRuntimeOptions extends Omit<DesktopLocalApiOptions, "host" | "port"> {
  host?: "127.0.0.1";
  port?: number;
  apiStarter?: DesktopApiStarter;
  transportFactory?: () => NodeHttpTransport;
}

export interface DesktopApiStarter {
  start(options: DesktopLocalApiOptions): Promise<DesktopLocalApi>;
}

export interface DesktopAppRuntimeState {
  status: "stopped" | "starting" | "ready" | "stopping" | "failed";
  apiUrl: string;
  lastError: string;
}

export class DesktopAppRuntime {
  private api: DesktopLocalApi | null = null;
  private client: DesktopApiClient | null = null;
  private state: DesktopAppRuntimeState = {
    status: "stopped",
    apiUrl: "",
    lastError: "",
  };

  constructor(private readonly options: DesktopAppRuntimeOptions) {}

  getState(): DesktopAppRuntimeState {
    return this.state;
  }

  getClient(): DesktopApiClient {
    if (!this.client) {
      throw new Error("desktop app runtime is not ready");
    }
    return this.client;
  }

  async start(): Promise<DesktopAppRuntimeState> {
    if (this.state.status === "ready") return this.state;

    this.state = {
      ...this.state,
      status: "starting",
      lastError: "",
    };

    try {
      const starter = this.options.apiStarter || defaultStarter;
      this.api = await starter.start({
        ...this.options,
        host: this.options.host || "127.0.0.1",
        port: this.options.port,
      });
      this.client = new DesktopApiClient({
        baseUrl: this.api.server.url,
        transport: this.options.transportFactory ? this.options.transportFactory() : new NodeHttpTransport(),
      });
      await this.client.health();
      this.state = {
        status: "ready",
        apiUrl: this.api.server.url,
        lastError: "",
      };
      return this.state;
    } catch (error) {
      await this.closeApi();
      this.state = {
        status: "failed",
        apiUrl: "",
        lastError: error instanceof Error ? error.message : String(error),
      };
      return this.state;
    }
  }

  async stop(): Promise<DesktopAppRuntimeState> {
    if (!this.api) {
      this.state = {
        status: "stopped",
        apiUrl: "",
        lastError: "",
      };
      return this.state;
    }

    this.state = {
      ...this.state,
      status: "stopping",
    };
    await this.closeApi();
    this.state = {
      status: "stopped",
      apiUrl: "",
      lastError: "",
    };
    return this.state;
  }

  async restart(): Promise<DesktopAppRuntimeState> {
    await this.stop();
    return this.start();
  }

  private async closeApi(): Promise<void> {
    if (this.api) {
      await this.api.close();
    }
    this.api = null;
    this.client = null;
  }
}

const defaultStarter: DesktopApiStarter = {
  start: startDesktopLocalApi,
};
