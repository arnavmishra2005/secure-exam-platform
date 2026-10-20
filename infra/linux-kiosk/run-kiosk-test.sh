#!/usr/bin/env bash
# run-kiosk-test.sh — safely test kiosk session in nested user-space window
# No root, no sudo, no system configuration changes.
#
# Usage:
#   bash infra/linux-kiosk/run-kiosk-test.sh [wayland|x11|app]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODE="${1:-auto}"

echo "=========================================================="
echo "  Secure Exam Platform — Safe User-Space Kiosk Test"
echo "  (Runs nested in user-space without root or OS lockdown)"
echo "=========================================================="

# Find an available AppImage or use dev mode
APPIMAGE="${APPIMAGE:-$(find "$REPO_ROOT/apps/exam-client/dist" "$REPO_ROOT/apps/exam-client/dist-electron" -name "*.AppImage" 2>/dev/null | head -n 1 || true)}"

if [[ -z "$APPIMAGE" || ! -x "$APPIMAGE" ]]; then
  echo "NOTE: No built AppImage found. To build one, run:"
  echo "  npm run desktop:build --workspace=@secure-exam/exam-client-desktop"
  echo ""
  echo "Falling back to Electron dev mode..."
  cd "$REPO_ROOT"
  export PATH="/home/arnav/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"
  npm run client:desktop
  exit 0
fi

echo "Using AppImage: $APPIMAGE"

if [[ "$MODE" == "auto" ]]; then
  if [[ -n "${WAYLAND_DISPLAY:-}" ]] && command -v cage &>/dev/null; then
    MODE="wayland"
  elif command -v Xephyr &>/dev/null; then
    MODE="x11"
  else
    MODE="app"
  fi
fi

case "$MODE" in
  wayland)
    echo "Launching nested Cage Wayland window..."
    exec cage -- "$APPIMAGE" --disable-extensions --disable-plugins
    ;;
  x11)
    echo "Launching isolated Xephyr X11 server on :2..."
    Xephyr :2 -ac -br -noreset -screen 1280x800 &
    XEPHYR_PID=$!
    trap 'kill $XEPHYR_PID 2>/dev/null || true' EXIT
    sleep 1
    DISPLAY=:2 APPIMAGE="$APPIMAGE" bash "$SCRIPT_DIR/kiosk-session/x11-session.sh"
    ;;
  app)
    echo "Launching AppImage directly in standalone test mode..."
    exec "$APPIMAGE"
    ;;
  *)
    echo "Unknown mode: $MODE (choose wayland, x11, or app)"
    exit 1
    ;;
esac

