#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/applications"
DESKTOP_FILE="${DESKTOP_DIR}/shift-scheduler.desktop"

mkdir -p "${DESKTOP_DIR}"
cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=勤務表作成
Comment=勤務表作成アプリ
Exec=${APP_ROOT}/start-shift-scheduler.sh
Path=${APP_ROOT}
Terminal=false
Categories=Office;
EOF

chmod +x "${APP_ROOT}/start-shift-scheduler.sh"
chmod +x "${DESKTOP_FILE}"
echo "desktop launcher installed: ${DESKTOP_FILE}"
