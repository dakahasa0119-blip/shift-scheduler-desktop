# Linux Solver Build Result

## Build Date

2026-05-23

## Artifact

```text
desktop/packaging/resources/solver/linux-x64/shift-solver
```

## Size

```text
65 MB
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
status: OPTIMAL
debugStatus: OPTIMAL
modelVersion: veteran-rule-model/20260523_all_plus_medium_candidate3_triage_carelate_rank_min20_softiso_stress_v2
sampleCount: 468
patternCount: 241
solverParameters: maxTimeInSeconds=20, numSearchWorkers=8, randomSeed=1
```

This verifies that the bundled executable is using the current `veteran_rule_policy.json`, not the older
`20260521_features_v5_combined` policy.

Desktop runner smoke test:

```text
npx -y -p tsx tsx desktop/tests/linuxBundledSolverSmoke.test.ts
```

Result:

```text
passed
```

Linux release archive was also assembled and smoke-tested after extraction.

Archive:

```text
/tmp/shift-scheduler-archives/shift-scheduler-linux-x64.tar.gz
```

SHA256:

```text
a6380f7d6913b5bfd65aa1effc7c613b501888fbbc5767681b7f19a9f0521940
```

Manifest:

```text
/tmp/shift-scheduler-archives/shift-scheduler-linux-x64.manifest.txt
```

Smoke ports:

```text
before archive: http://127.0.0.1:45980
after extraction: http://127.0.0.1:45982
```

## Notes

- PyInstaller was installed into the development `.venv`.
- The generated solver executable is platform-specific for Linux x64.
- Windows will require a separate Windows build.
- PyInstaller intermediate build files were removed after verification.
- The executable remains under `desktop/packaging/resources/solver/linux-x64/`.
- The release archive is a local artifact under `/tmp/shift-scheduler-archives/`.
- The rebuilt executable includes `shift_solver/veteran_rule_policy.json`.
- Candidate selection uses action-first tuple ranking.
- Veteran policy matching supports safe partial matches for composite role and availability axes.

## Next Checks

- Add a solver version command before real packaging.
- Decide whether to keep or regenerate the Linux binary during release builds.
- Windows still requires a separate final smoke test on Windows.
