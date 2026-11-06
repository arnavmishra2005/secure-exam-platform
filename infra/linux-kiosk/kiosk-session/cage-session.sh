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
export EXAM_KIOSK_SESSION=1

INSTALL_DIR="${INSTALL_DIR:-/opt/secure-exam}"
APPIMAGE="${APPIMAGE:-$INSTALL_DIR/SecureExam.AppImage}"

if [[ ! -x "$APPIMAGE" ]]; then
  echo "ERROR: Exam AppImage not found or not executable: $APPIMAGE" >&2
  exit 1
fi

# cage flags:
#   -d           — suppress client-side window decorations
# VT switching stays disabled by omitting -s (which would enable it).
# Chromium/Electron flags:
#   Preserves full Chromium multi-process sandbox (no --no-sandbox).
exec cage -d -- "$APPIMAGE" \
  --disable-extensions \
  --disable-plugins \
  --disable-background-networking

