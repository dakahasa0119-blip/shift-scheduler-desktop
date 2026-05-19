#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${APP_ROOT}"

if [[ -x "desktop/packaging/runtime/node" ]]; then
  exec "desktop/packaging/runtime/node" desktop/dist/shift-scheduler.cjs "$@"
fi

exec node desktop/dist/shift-scheduler.cjs "$@"
