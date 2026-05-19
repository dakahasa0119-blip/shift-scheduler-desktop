import { buildPackageArchivePlan, renderArchiveManifest } from "../packaging/packageArchive";

function main(): void {
  const plan = buildPackageArchivePlan({
    target: "linux-prototype",
    assembledDirectory: "/tmp/release/linux-prototype",
    archiveRoot: "/tmp/archives",
  });
  assertEqual(plan.archivePath, "/tmp/archives/shift-scheduler-linux-prototype.tar.gz", "archive path");
  assertEqual(plan.checksumPath, "/tmp/archives/shift-scheduler-linux-prototype.tar.gz.sha256.txt", "checksum path");
  assertEqual(plan.manifestPath, "/tmp/archives/shift-scheduler-linux-prototype.manifest.txt", "manifest path");
  assertEqual(plan.verifyExtractRoot, "/tmp/shift-scheduler-archive-verify", "verify root");
  assertEqual(plan.verifyExtractedDirectory, "/tmp/shift-scheduler-archive-verify/linux-prototype", "verify directory");

  const manifest = renderArchiveManifest(plan, 123, "abc123");
  assertIncludes(manifest, "target: linux-prototype", "manifest target");
  assertIncludes(manifest, "sizeBytes: 123", "manifest size");
  assertIncludes(manifest, "sha256: abc123", "manifest checksum");
  assertIncludes(manifest, "verifyExtractedDirectory: /tmp/shift-scheduler-archive-verify/linux-prototype", "manifest verify");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main();
