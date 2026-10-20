#!/usr/bin/env bash
# x11-session.sh — X11 fallback kiosk session (for machines without Wayland/cage)
#
# Uses xinit to start a minimal X server, then openbox in kiosk mode as the
# window manager, then launches the Electron AppImage.
#
# Openbox kiosk config disables right-click menus, alt-tab, and all hotkeys.
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

# Write a minimal openbox config that disables all keybindings and menus
OB_CONFIG_DIR="$HOME/.config/openbox"
mkdir -p "$OB_CONFIG_DIR"

cat > "$OB_CONFIG_DIR/rc.xml" <<'OBRC'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <keyboard>
    <!-- No keybindings at all — prevents alt-F4, alt-tab, super, etc. -->
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
    <!-- Single desktop only — no workspace switching -->
    <number>1</number>
    <firstdesk>1</firstdesk>
  </desktops>
</openbox_config>
OBRC

cat > "$OB_CONFIG_DIR/menu.xml" <<'OBMENU'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu">
  <!-- Empty menu — no right-click options -->
</openbox_menu>
OBMENU

# Write the xinitrc that starts openbox and then the exam app
XINITRC="$HOME/.xinitrc"
cat > "$XINITRC" <<XINITEOF
#!/bin/sh
# Disable screen saver and power management
xset s off
xset s noblank
xset -dpms

# Disable Ctrl+Alt+Backspace (zap) — belt-and-suspenders with disable-escapes.sh
setxkbmap -option "" 2>/dev/null || true

# Start openbox as window manager (background)
openbox &
OB_PID=\$!

# Wait briefly for openbox to initialize
sleep 0.5

# Launch the Electron kiosk app
INVIGILATOR_PIN="${INVIGILATOR_PIN:-1234}" \
API_URL="${API_URL:-http://localhost:3000}" \
"$APPIMAGE" \
  --no-sandbox \
  --disable-gpu-sandbox \
  --disable-extensions \
  --disable-plugins \
  --disable-background-networking

# When app exits (invigilator exited), kill openbox
kill \$OB_PID 2>/dev/null || true
XINITEOF

chmod +x "$XINITRC"

# xinit flags:
#   -- :0 vt1    — use display :0 on VT1 (same VT as autologin)
exec xinit "$XINITRC" -- :0 vt1 -nolisten tcp

