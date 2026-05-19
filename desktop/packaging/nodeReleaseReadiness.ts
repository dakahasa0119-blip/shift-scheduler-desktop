import { buildReleaseManifest, checkReleaseReadiness, parseReleaseTarget, type ReleaseTarget } from "./releaseManifest";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  exitCode?: number;
};

const fs = require("node:fs");

export function checkNodeReleaseReadiness(target: ReleaseTarget) {
  return checkReleaseReadiness(buildReleaseManifest({ target }), {
    exists: (filePath) => fs.existsSync(filePath),
  });
}

function main(): void {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  let target: ReleaseTarget;
  try {
    target = parseReleaseTarget(targetArg ? targetArg.replace("--target=", "") : undefined);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const result = checkNodeReleaseReadiness(target);
  console.log(`target: ${result.target}`);
  console.log(`ready: ${result.ok ? "yes" : "no"}`);
  result.missingRequired.forEach((item) => console.log(`missing required: ${item.path} (${item.description})`));
  result.missingOptional.forEach((item) => console.log(`missing optional: ${item.path} (${item.description})`));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeReleaseReadiness.ts") || arg.endsWith("nodeReleaseReadiness.ts"))) {
  main();
}
