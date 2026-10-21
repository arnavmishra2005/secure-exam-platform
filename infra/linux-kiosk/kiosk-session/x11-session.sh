#!/usr/bin/env bash
# x11-session.sh — X11 fallback kiosk session (for machines without Wayland/cage)
#
# Uses an isolated Openbox configuration that disables all keybindings,
# desktop menus, and window decorations, launching the Electron AppImage
# without touching the user's home configuration or disabling sandboxing.
#
# Environment variables:
#   INSTALL_DIR     — directory containing SecureExam.AppImage (default /opt/secure-exam)
#   APPIMAGE        — direct path to AppImage (optional override)
#   INVIGILATOR_PIN — PIN required to exit kiosk (default 1234)
#   API_URL         — backend API base URL

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/secure-exam}"
APPIMAGE="${APPIMAGE:-$INSTALL_DIR/SecureExam.AppImage}"

if [[ ! -x "$APPIMAGE" ]]; then
  echo "ERROR: Exam AppImage not found or not executable: $APPIMAGE" >&2
  exit 1
fi

# Isolated temporary configuration directory (never touches ~/.config/openbox or ~/.xinitrc)
CONFIG_DIR=$(mktemp -d /tmp/secure-exam-openbox-XXXXXX)
trap 'rm -rf "$CONFIG_DIR"' EXIT

cat > "$CONFIG_DIR/rc.xml" <<'OBRC'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <keyboard>
    <!-- No keybindings — suppresses Alt+F4, Alt+Tab, Super, workspace switches -->
  </keyboard>
  <mouse>
    <context name="Root">
      <!-- No right-click desktop menu -->
    </context>
  </mouse>
  <applications>
    <application class="*">
      <fullscreen>yes</fullscreen>
      <maximized>yes</maximized>
      <decor>no</decor>
      <focus>yes</focus>
      <layer>above</layer>
    </application>
  </applications>
  <desktops>
    <number>1</number>
    <firstdesk>1</firstdesk>
  </desktops>
</openbox_config>
OBRC

cat > "$CONFIG_DIR/menu.xml" <<'OBMENU'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu">
</openbox_menu>
OBMENU

# Session script to run inside X11
cat > "$CONFIG_DIR/xsession.sh" <<XINITEOF
#!/bin/sh
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true
xset -dpms 2>/dev/null || true

# Start Openbox with isolated config
openbox --config-file "$CONFIG_DIR/rc.xml" &
OB_PID=\$!

# Brief pause to allow WM to register
sleep 0.3

# Launch the Electron kiosk app with Chromium sandbox preserved
INVIGILATOR_PIN="${INVIGILATOR_PIN:-1234}" \
API_URL="${API_URL:-http://localhost:3000}" \
"$APPIMAGE" \
  --disable-extensions \
  --disable-plugins \
  --disable-background-networking

# When app exits (invigilator exit or submission), stop openbox
kill \$OB_PID 2>/dev/null || true
XINITEOF

chmod +x "$CONFIG_DIR/xsession.sh"

if [[ -n "${DISPLAY:-}" ]]; then
  # Already in an X session (e.g. launched from Display Manager Xsession or Xephyr)
  exec "$CONFIG_DIR/xsession.sh"
else
  # Running from console: start a dedicated X server
  exec xinit "$CONFIG_DIR/xsession.sh" -- :1 -nolisten tcp
fi
