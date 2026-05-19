# Solver Resource Packaging

## Resource Layout

The packaged app should contain solver artifacts under an internal resources directory.

```text
resources/
  solver/
    linux-x64/
      shift-solver
    windows-x64/
      shift-solver.exe
```

## Runtime Selection

The app chooses the artifact by platform.

Initial platforms:

- `linux-x64`
- `windows-x64`

Automatic build entry:

```text
npx -y -p tsx tsx desktop/solver/nodeBuildSolver.ts
```

This detects the current OS and builds the matching solver artifact only when needed.
The Windows executable must be built on Windows or a Windows CI runner and ends up at:

```text
desktop/packaging/resources/solver/windows-x64/shift-solver.exe
```

## App Responsibilities

The app must:

- Resolve the bundled solver path.
- Confirm the executable exists.
- Confirm it can be executed.
- Create temporary input/output/debug paths.
- Run the solver with argument arrays, not shell strings.
- Read output JSON.
- Convert output into desktop diagnostics.
- Clean temporary files unless support logging is enabled.

## User Responsibilities

None.

The user should not install, configure, start, stop, or update the solver separately.

## Support Mode

When support mode is enabled, keep:

- solver input JSON
- solver output JSON
- solver debug JSON
- stderr/stdout
- elapsed time

Normal mode should keep only concise logs.
