import { buildPyInstallerCommand, findSolverBuildTarget, formatCommand, parseSolverBuildPlatform } from "./buildPlan";

declare const process: {
  argv: string[];
  exitCode?: number;
};

function main(): void {
  const platformArg = process.argv.find((arg) => arg.startsWith("--platform="));
  let platform;
  try {
    platform = parseSolverBuildPlatform(platformArg ? platformArg.replace("--platform=", "") : undefined);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const command = buildPyInstallerCommand(findSolverBuildTarget(platform));
  console.log(`platform: ${platform}`);
  console.log(`command: ${formatCommand(command)}`);
  console.log(`output: ${command.outputExecutablePath}`);
}

if (process.argv.some((arg) => arg.endsWith("desktop/solver/nodeBuildCommand.ts") || arg.endsWith("nodeBuildCommand.ts"))) {
  main();
}
