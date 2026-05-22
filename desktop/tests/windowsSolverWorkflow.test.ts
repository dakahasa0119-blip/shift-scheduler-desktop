declare const require: (name: string) => any;

const fs = require("node:fs");

function main(): void {
  const source = fs.readFileSync(".github/workflows/build-windows-solver.yml", "utf8");
  assertIncludes(source, "desktop/solver/nodeBuildSolver.ts --platform=windows-x64 --force", "shared solver builder");
  assertNotIncludes(source, "python -m PyInstaller", "duplicated pyinstaller command");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertNotIncludes(text: string, unexpected: string, label: string): void {
  if (text.includes(unexpected)) {
    throw new Error(`${label}: unexpected ${unexpected}`);
  }
}

main();
