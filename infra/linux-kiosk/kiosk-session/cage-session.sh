#!/usr/bin/env bash
# cage-session.sh — Wayland kiosk session using cage compositor
#
# cage launches a single application fullscreen with no window decorations,
# no taskbar, no alt-tab, no virtual desktops. The app cannot escape.
#
# Environment variables (set by exam-kiosk.service):
#   INSTALL_DIR     — directory containing SecureExam.AppImage (default /opt/secure-exam)
#   INVIGILATOR_PIN — PIN required to exit kiosk (default 1234)
#   API_URL         — backend API base URL

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/secure-exam}"
APPIMAGE="$INSTALL_DIR/SecureExam.AppImage"

if [[ ! -x "$APPIMAGE" ]]; then
  echo "ERROR: AppImage not found or not executable: $APPIMAGE" >&2
  exit 1
fi

# cage flags:
#   -d           — disable VT-switching inside the cage session
# Electron flags:
#   --no-sandbox — required when running as the 'exam' system user (no setuid helper)
#                  Sandboxing is delegated to cage + OS-level restrictions.
#   --disable-gpu-sandbox — avoid GPU driver sandbox issues on lab hardware
exec cage -d -- "$APPIMAGE" \
  --no-sandbox \
  --disable-gpu-sandbox \
  --disable-extensions \
  --disable-plugins \
  --disable-background-networking

