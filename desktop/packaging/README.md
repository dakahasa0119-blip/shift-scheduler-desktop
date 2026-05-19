# Packaging Plan

The desktop version should behave like a normal application.

## User Experience

The user should:

1. Start the app.
2. Enter or load staff data.
3. Create a schedule.
4. Review clear confirmation messages.
5. Export Excel or PDF.

The user should not:

- Start a local server.
- Pick a port.
- Restart solver processes.
- Open logs unless support asks.
- Edit internal database files.

## Windows Packaging Concerns

- App installer
- OR-Tools packaging
- Local API process management
- Windows Defender warnings
- Code signing
- App data directory
- Backup and restore
- Crash logs

Solver resource details:

- [Solver Resource Packaging](SOLVER_RESOURCES.md)

Release preparation:

```text
npx -y -p tsx tsx desktop/packaging/nodePrepareRelease.ts
```

This detects the current OS, prepares the matching bundled solver, and runs the matching release readiness check.

Release assembly:

```text
npx -y -p tsx tsx desktop/packaging/nodeAssembleRelease.ts
```

This runs release preparation, copies the current prototype bundle into an output directory outside `desktop/`, then starts the assembled bundle and checks the initial screen, input check, and solve route.

Release archive:

```text
npx -y -p tsx tsx desktop/packaging/nodeArchiveRelease.ts
```

This runs assembly with smoke checks, creates a `.tar.gz` archive outside `desktop/`, writes checksum and manifest text files, then extracts the archive into a clean verification directory and smoke-checks the extracted bundle.
The smoke check covers startup, input check, solve, save, load, backup, JSON export/import, settings import, and schedule TSV export/import.

Lower-level solver artifact build:

```text
npx -y -p tsx tsx desktop/solver/nodeBuildSolver.ts
```

This is normally called by release preparation and should be used directly only for support/debugging.

Lower-level release readiness checks:

```text
npx -y -p tsx tsx desktop/packaging/nodeReleaseReadiness.ts --target=linux-prototype
npx -y -p tsx tsx desktop/packaging/nodeReleaseReadiness.ts --target=windows-prototype
```

The Linux prototype is ready when the launcher, desktop entry plan, and Linux solver executable are present.
The Windows prototype is ready only when the Windows launcher and Windows solver executable are both present.

## Linux Prototype Concerns

- Keep the runtime shape close to Windows.
- Avoid Linux-only assumptions.
- Use app-managed child processes early, even if the first developer prototype can be started manually.

## Current Linux Prototype Entry

The current developer entry is:

```text
npx -y -p tsx tsx desktop/app/linuxLauncher.ts
```

There is also a developer launcher wrapper:

```text
desktop/packaging/linux/shift-scheduler-dev
```

Behavior:

- Starts the runtime-backed app shell.
- Starts the local API automatically.
- Uses `127.0.0.1`.
- Opens the default browser through `xdg-open`.
- Closes the app shell when the launcher is interrupted.
- `SHIFT_DESKTOP_NO_OPEN=1` can be used by tests to suppress browser opening.

This is still a developer prototype entry. A packaged Linux/Windows build should replace `tsx` and `xdg-open` with the app bundle's native launcher.

## Current Windows Prototype Entry

The current developer entry is:

```text
npx -y -p tsx tsx desktop/app/windowsLauncher.ts
```

There is also a developer launcher wrapper:

```text
desktop/packaging/windows/shift-scheduler-dev.cmd
```

Behavior:

- Starts the runtime-backed app shell.
- Starts the local API automatically.
- Uses `127.0.0.1`.
- Opens the default browser through `cmd /c start`.
- Closes the app shell when the launcher is interrupted.
- `SHIFT_DESKTOP_NO_OPEN=1` can be used by tests to suppress browser opening.

This is still a developer prototype entry. A packaged Windows build should replace `tsx` with the app bundle's native launcher and must include `desktop/packaging/resources/solver/windows-x64/shift-solver.exe`.
