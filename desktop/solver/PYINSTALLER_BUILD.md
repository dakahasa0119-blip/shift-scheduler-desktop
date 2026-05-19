# PyInstaller Solver Build Plan

## Purpose

Build the solver as a standalone executable that can be bundled inside the desktop app.

Users must not install Python or OR-Tools separately.

## Development Source

The current solver source remains outside `desktop/` during early migration:

```text
solver_cli/shift_solver
```

The desktop build plan treats that solver as the source to package.

## Target Artifacts

```text
desktop/packaging/resources/solver/linux-x64/shift-solver
desktop/packaging/resources/solver/windows-x64/shift-solver.exe
```

## Expected Runtime Contract

```text
shift-solver solve input.json --out output.json --debug debug.json --time-limit 120
```

## Build Command Shape

The command should be built as an argument array, not a shell string.

Current release preparation entry:

- `desktop/packaging/nodePrepareRelease.ts`

This is the top-level path. It detects the current OS, prepares the matching bundled solver, and runs readiness.

```text
npx -y -p tsx tsx desktop/packaging/nodePrepareRelease.ts
```

Lower-level solver build entry:

- `nodeBuildSolver.ts`

The build entry detects the current OS, builds the matching solver artifact only when needed, and runs release readiness after the build.

```text
npx -y -p tsx tsx desktop/solver/nodeBuildSolver.ts
```

Internal command planner:

- `buildPlan.ts`
- `nodeBuildCommand.ts`

Example Linux command shape:

```text
pyinstaller --onefile --name shift-solver --distpath desktop/packaging/resources/solver/linux-x64 --clean --noconfirm --collect-all ortools desktop/solver/pyinstaller_entry.py
```

Print the planned command only for support/debugging:

```text
npx -y -p tsx tsx desktop/solver/nodeBuildCommand.ts --platform=linux-x64
npx -y -p tsx tsx desktop/solver/nodeBuildCommand.ts --platform=windows-x64
```

## Verification After Build

After producing an executable, verify:

1. The executable starts without system Python.
2. `solve input.json --out output.json --debug debug.json --time-limit 10` works.
3. Output JSON has `schemaVersion: gas-shift-solver-output/v1`.
4. Infeasible schedules return JSON diagnostics rather than crashing.
5. Non-zero exit code is reserved for technical failure.

## Windows Notes

- Build Windows artifact on Windows or a Windows CI runner.
- Expect Windows Defender/code signing concerns before real deployment.
- The final installer must include `shift-solver.exe`.
- The expected output path is `desktop/packaging/resources/solver/windows-x64/shift-solver.exe`.
- On Windows, run `npx -y -p tsx tsx desktop/solver/nodeBuildSolver.ts`; it builds the Windows artifact and runs readiness.
- Linux hosts intentionally refuse to build the Windows artifact because PyInstaller does not cross-build it correctly.

## Linux Notes

- Ensure executable permission is preserved.
- Avoid relying on system Python.
- Keep the prototype close to Windows runtime behavior.

## Not Done Yet

- Windows artifact creation
- Runtime version command
- Code signing
