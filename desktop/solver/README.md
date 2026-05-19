# Bundled Solver Workspace

This directory tracks the desktop packaging plan for the solver.

The production desktop app should ship with the solver included.

Users must not install Python, OR-Tools, or a separate solver service.

## Intended Runtime

```text
Desktop app
  -> SolverRunner
  -> bundled solver executable
  -> output JSON
  -> desktop diagnostics
```

## First Prototype

The first Linux prototype may call the existing repository solver during development.

The packaged Windows/Linux app should use a bundled executable artifact instead.

## Expected Executable Contract

```text
shift-solver solve input.json --out output.json --debug debug.json --time-limit 120
```

## Current Code

- `bundledSolverTypes.ts`: platform artifact and invocation types
- `bundledSolverRunner.ts`: app-facing runner that writes input, invokes the solver, reads output, and cleans temporary files
- `nodeBundledSolverRuntime.ts`: Node-side file/process adapters for Linux/Windows prototype runtime
- `manifest.ts`: initial platform manifest and runtime config resolver
- `buildPlan.ts`: PyInstaller command planner for platform artifacts

## Build Plan

- [PyInstaller Solver Build Plan](PYINSTALLER_BUILD.md)
- [Linux Solver Build Result](LINUX_BUILD_RESULT.md)

## Windows Artifact Import

If a trusted Windows solver build already exists, import it instead of rebuilding on this host:

```text
npx -y -p tsx tsx desktop/solver/nodeDownloadWindowsSolver.ts --url=https://example.test/shift-solver.exe --sha256=<64-hex-sha256>
```

The importer writes to `desktop/packaging/resources/solver/windows-x64/shift-solver.exe` and runs the Windows release readiness check. Use a checked hash for release work.

## Guardrails

- Do not require user-managed setup.
- Do not require network access.
- Do not rely on system Python.
- Do not expose solver paths to normal users.
- Keep solver logs available for support.
