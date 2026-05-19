import { JsonDocumentStore, type JsonDocumentStoreFileSystem } from "./jsonDocumentStore";

declare const require: (name: string) => any;
declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
};

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

export function createNodeDocumentStore(): JsonDocumentStore {
  return new JsonDocumentStore({
    directory: resolveAppDataDirectory(),
    files: new NodeDocumentStoreFileSystem(),
    clock: {
      now: () => new Date(),
    },
  });
}

export function resolveAppDataDirectory(): string {
  if (process.env.SHIFT_DESKTOP_DATA_DIR) return process.env.SHIFT_DESKTOP_DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "ShiftScheduler");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "shift-scheduler");
}

class NodeDocumentStoreFileSystem implements JsonDocumentStoreFileSystem {
  async ensureDirectory(directory: string): Promise<void> {
    await fs.mkdir(directory, { recursive: true });
  }

  async writeText(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf8");
  }

  async readText(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
