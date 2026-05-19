# Solver Bundling Plan

## Goal

The desktop app must include the solver.

Users should not install Python, OR-Tools, command line tools, or a separate solver service.

The final user experience should be:

```text
Install app
Open app
Click create schedule
```

Everything else is internal.

## Packaging Principle

The solver is an internal app component.

It should be versioned, shipped, started, stopped, and logged by the desktop app.

## Recommended Path

### Step 1: Linux Prototype

Use the existing solver behavior through the `SolverRunner` boundary.

At this stage, development can call a local solver command, but this is not the final user experience.

### Step 2: Solver Executable

Build the solver into a standalone executable per platform.

Candidate:

```text
PyInstaller
```

Expected artifacts:

```text
solver-linux-x64
solver-windows-x64.exe
```

### Step 3: App Resources

Place the platform-specific solver executable inside the packaged app resources.

Example shape:

```text
resources/
  solver/
    linux-x64/
      shift-solver
    windows-x64/
      shift-solver.exe
```

The app chooses the correct executable at runtime.

### Step 4: App-managed Execution

The app writes solver input to a temporary file, runs the bundled solver, reads solver output, then deletes temporary files unless debug logging is enabled.

The user never sees:

- solver executable path
- input JSON path
- output JSON path
- command line
- environment variables

## Runtime Contract

The packaged solver executable should support:

```text
shift-solver solve input.json --out output.json --debug debug.json --time-limit 120
```

Current desktop-side runner:

- `desktop/solver/bundledSolverRunner.ts`
- `desktop/solver/nodeBundledSolverRuntime.ts`
- `desktop/solver/manifest.ts`
- `desktop/solver/buildPlan.ts`

The runner uses injected file-system and process-executor interfaces so the implementation can be wired to Tauri/Node packaging later without changing API handlers.

Build procedure draft:

- `desktop/solver/PYINSTALLER_BUILD.md`

Required behavior:

- Exit code `0` on successful execution, even if the schedule is infeasible and diagnostics are returned.
- Non-zero exit code only for technical failure.
- Always write output JSON when possible.
- Write debug JSON when requested.
- Do not require network access.

## Failure Handling

Technical failure should become a user-friendly API error:

```text
勤務表作成中に問題が発生しました。もう一度実行してください。
```

Support logs should include:

- solver executable path
- exit code
- stderr
- elapsed time
- input/output temp file paths
- app version
- solver version

## Windows Concerns

- Windows Defender may warn on unsigned executables.
- Code signing may be required before real deployment.
- Solver executable and app should be updated together.
- The installer must include the solver artifact.
- The solver should not require admin rights.
- Temporary files should be under the app data or temp directory.

## Linux Concerns

- Executable permission must be set.
- Avoid relying on system Python.
- Avoid relying on system OR-Tools.
- Keep paths free of shell quoting assumptions by using argument arrays.

## Open Questions

- PyInstaller versus another Python packaging tool.
- Whether to keep one solver executable per platform or one per CPU architecture.
- Where to store debug artifacts when support mode is enabled.
- How to expose solver version in app diagnostics.
