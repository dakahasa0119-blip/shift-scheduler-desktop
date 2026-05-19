# Shift Scheduler Desktop

Local desktop version of the shift scheduler app.

This repository builds self-contained Linux and Windows release archives that include:

- the browser-based local app
- a bundled Node.js runtime
- a bundled OR-Tools solver executable
- Excel/PDF export paths
- save/load/backup support
- release smoke checks

## Build

Linux release:

```bash
npm run release:linux
```

Windows release:

```bash
npm run release:windows
```

The generated archives are written under:

```text
/tmp/shift-scheduler-archives
```

## Test

```bash
npm test
```

## Release Archives

Linux:

```text
shift-scheduler-linux-x64.tar.gz
```

Windows:

```text
shift-scheduler-windows-x64.zip
```

The archive root contains `README.txt`, user documentation, and the start script:

- Linux: `start-shift-scheduler.sh`
- Windows: `start-shift-scheduler.vbs`
