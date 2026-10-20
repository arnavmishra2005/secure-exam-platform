#!/usr/bin/env bash
# secure-exam-session.sh — display manager session launcher
# Dispatches to Wayland (cage) if available and supported, otherwise X11 (openbox).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Prefer Wayland cage compositor, fallback to X11
if command -v cage &>/dev/null && [[ "${1:-}" != "--x11" ]]; then
  exec "$SCRIPT_DIR/kiosk-session/cage-session.sh"
else
  exec "$SCRIPT_DIR/kiosk-session/x11-session.sh"
fi

