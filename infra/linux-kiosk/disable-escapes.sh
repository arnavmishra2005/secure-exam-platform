#!/usr/bin/env bash
# disable-escapes.sh — harden the Linux console against kiosk escape paths
# Run as root during provisioning (called by setup-exam-kiosk.sh).
#
# Escape paths blocked:
#   1. Ctrl+Alt+Fn VT switching (tty2-tty6 gettys masked)
#   2. SysRq key (kernel.sysrq=0)
#   3. Ctrl+Alt+Backspace (X11 "zap" — also disabled in x11-session.sh xinitrc)
#   4. Ctrl+Alt+Delete reboot (systemd override)
#   5. Crash dumps to /proc/sysrq-trigger

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root" >&2
  exit 1
fi

echo "  [escape] Masking getty on tty2-tty6 (blocks VT switching)"
for n in 2 3 4 5 6; do
  systemctl mask "getty@tty${n}.service" 2>/dev/null || true
  systemctl stop  "getty@tty${n}.service" 2>/dev/null || true
done

echo "  [escape] Disabling SysRq (kernel.sysrq=0)"
sysctl -w kernel.sysrq=0
# Persist across reboots
SYSCTL_CONF="/etc/sysctl.d/99-exam-kiosk.conf"
cat > "$SYSCTL_CONF" <<'EOF'
# Secure Exam Kiosk — kernel hardening
kernel.sysrq = 0
EOF

echo "  [escape] Disabling Ctrl+Alt+Del reboot"
systemctl mask ctrl-alt-del.target 2>/dev/null || true

echo "  [escape] Disabling Ctrl+Alt+Backspace (X11 zap) system-wide"
# setxkbmap cannot run as root without DISPLAY; the xinitrc handles this for X11.
# For completeness, write an Xorg config that disables the ZapWarning/Zap option.
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/99-no-zap.conf <<'EOF'
Section "ServerFlags"
    Option "DontZap" "true"
EndSection
EOF

echo "  [escape] Writing /etc/sysctl.d persistence"
sysctl --system >/dev/null 2>&1 || true

echo "  ✅  Escape paths disabled."

