# Linux Solver Build Result

## Build Date

2026-05-19

## Artifact

```text
desktop/packaging/resources/solver/linux-x64/shift-solver
```

## Size

```text
61 MB
```

## Verification

The generated executable starts without calling the Python interpreter directly.

Help command:

```text
./desktop/packaging/resources/solver/linux-x64/shift-solver --help
```

Result:

```text
usage: shift_solver [-h] {solve} ...
```

Solve command was tested using an existing local solver input payload from `.solver_runs`.

Result:

```text
status: INFEASIBLE
schema: gas-shift-solver-output/v1
scheduleRows: 10
debugStatus: INFEASIBLE
```

This is acceptable for the build verification because the executable returned valid solver JSON and diagnostics instead of crashing.

Desktop runner smoke test:

```text
npx -y -p tsx tsx desktop/tests/linuxBundledSolverSmoke.test.ts
```

Result:

```text
passed
```

## Notes

- PyInstaller was installed into the development `.venv`.
- The generated solver executable is platform-specific for Linux x64.
- Windows will require a separate Windows build.
- PyInstaller intermediate build files were removed after verification.
- The executable remains under `desktop/packaging/resources/solver/linux-x64/`.

## Next Checks

- Add a solver version command before real packaging.
- Decide whether to keep or regenerate the Linux binary during release builds.
