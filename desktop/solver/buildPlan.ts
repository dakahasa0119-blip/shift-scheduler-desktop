export type SolverBuildPlatform = "linux-x64" | "windows-x64";

export const solverBuildPlatforms: SolverBuildPlatform[] = ["linux-x64", "windows-x64"];

export interface SolverBuildTarget {
  platform: SolverBuildPlatform;
  executableName: string;
  outputDirectory: string;
  sourceModule: string;
}

export interface SolverBuildCommand {
  executable: string;
  args: string[];
  outputExecutablePath: string;
}

export function buildPyInstallerCommand(target: SolverBuildTarget): SolverBuildCommand {
  return {
    executable: "pyinstaller",
    args: [
      "--onefile",
      "--name",
      stripExecutableExtension(target.executableName),
      "--distpath",
      target.outputDirectory,
      "--clean",
      "--noconfirm",
      "-m",
      target.sourceModule,
    ],
    outputExecutablePath: joinPath(target.outputDirectory, target.executableName),
  };
}

export function isSolverBuildPlatform(value: string): value is SolverBuildPlatform {
  return solverBuildPlatforms.some((platform) => platform === value);
}

export function parseSolverBuildPlatform(value: string | undefined): SolverBuildPlatform {
  if (!value) return "linux-x64";
  if (isSolverBuildPlatform(value)) return value;
  throw new Error(`unknown solver build platform: ${value}`);
}

export function findSolverBuildTarget(platform: SolverBuildPlatform): SolverBuildTarget {
  const target = initialSolverBuildTargets.find((item) => item.platform === platform);
  if (!target) throw new Error(`solver build target missing: ${platform}`);
  return target;
}

export function formatCommand(command: SolverBuildCommand): string {
  return [command.executable, ...command.args.map(quoteArg)].join(" ");
}

export const initialSolverBuildTargets: SolverBuildTarget[] = [
  {
    platform: "linux-x64",
    executableName: "shift-solver",
    outputDirectory: "desktop/packaging/resources/solver/linux-x64",
    sourceModule: "shift_solver",
  },
  {
    platform: "windows-x64",
    executableName: "shift-solver.exe",
    outputDirectory: "desktop/packaging/resources/solver/windows-x64",
    sourceModule: "shift_solver",
  },
];

function stripExecutableExtension(name: string): string {
  return name.endsWith(".exe") ? name.slice(0, -4) : name;
}

function joinPath(left: string, right: string): string {
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}

function quoteArg(value: string): string {
  if (!/[\s"'\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
