import { JsonDocumentStore, type JsonDocumentStoreFileSystem } from "../storage/jsonDocumentStore";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const files = new MemoryFiles();
  const store = new JsonDocumentStore({
    directory: "/app-data",
    files,
    clock: {
      now: () => new Date(2026, 4, 20, 1, 2, 3),
    },
  });

  const saved = await store.save(sampleMonthlyScheduleDocument);
  assertEqual(saved.filePath, "/app-data/current-schedule.json", "save path");
  assertEqual(files.directories.has("/app-data"), true, "directory created");

  const loaded = await store.load();
  assertEqual(loaded.document.month, sampleMonthlyScheduleDocument.month, "loaded month");

  const backup = await store.backup(sampleMonthlyScheduleDocument);
  assertEqual(backup.filePath, "/app-data/backup-20260520-010203.json", "backup path");
  assertEqual(files.values.has(backup.filePath), true, "backup written");
}

class MemoryFiles implements JsonDocumentStoreFileSystem {
  directories = new Set<string>();
  values = new Map<string, string>();

  async ensureDirectory(path: string): Promise<void> {
    this.directories.add(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.values.set(path, content);
  }

  async readText(path: string): Promise<string> {
    const value = this.values.get(path);
    if (value == null) throw new Error(`missing ${path}`);
    return value;
  }

  async exists(path: string): Promise<boolean> {
    return this.values.has(path);
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
