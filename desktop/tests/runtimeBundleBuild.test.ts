declare const require: (name: string) => any;

const fs = require("node:fs");

function main(): void {
  const source = fs.readFileSync("desktop/packaging/nodeBuildRuntimeBundle.ts", "utf8");
  assertIncludes(source, "esbuild", "uses esbuild");
  assertIncludes(source, "--bundle", "bundles runtime");
  assertIncludes(source, "desktop/dist/shift-scheduler.cjs", "default output");
  assertIncludes(source, "--external:node:*", "node builtins externalized");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main();

export {};
