declare const require: (name: string) => any;

const fs = require("node:fs");

function main(): void {
  const source = fs.readFileSync("desktop/packaging/nodePrepareNodeRuntime.ts", "utf8");
  assertIncludes(source, "nodejs.org/dist", "downloads official node distribution");
  assertIncludes(source, "windows-x64/node.exe", "windows output");
  assertIncludes(source, "linux-x64/node", "linux output");
  assertIncludes(source, "24.11.1", "pinned node version");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main();

export {};
