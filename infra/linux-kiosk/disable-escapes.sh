#!/usr/bin/env bash
# disable-escapes.sh — opt-in lab PC console hardening against kiosk escapes
#
# WARNING: This script is intended strictly for DEDICATED LAB PCs in an isolated environment.
# DO NOT run this on everyday laptops or workstations.
#
# Escape paths blocked:
#   1. Ctrl+Alt+Fn VT switching (tty2-tty6 gettys masked)
#   2. SysRq key (kernel.sysrq=0 in /etc/sysctl.d/99-exam-kiosk.conf)
#   3. Ctrl+Alt+Delete reboot (systemd ctrl-alt-del.target masked)
#   4. Ctrl+Alt+Backspace (X11 zap disabled via xorg.conf.d)
#
# To undo all of these changes safely, run:
#   sudo bash infra/linux-kiosk/rollback-exam-kiosk.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root (sudo bash $0)" >&2
  exit 1
fi

if [[ "${1:-}" != "--confirm-lab-hardening" ]]; then
  echo "=================================================================" >&2
  echo "SAFETY GUARD: disable-escapes.sh disables VT console switching" >&2
  echo "and emergency recovery keys (SysRq, Ctrl+Alt+Del) on this system." >&2
  echo "This is only safe on disposable/dedicated lab hardware." >&2
  echo "" >&2
  echo "To proceed on a dedicated lab machine, re-run with:" >&2
  echo "  sudo bash $0 --confirm-lab-hardening" >&2
  echo "=================================================================" >&2
  exit 1
fi

echo "  [escape] Masking getty on tty2-tty6 (blocks VT switching)"
for n in 2 3 4 5 6; do
  systemctl mask "getty@tty${n}.service" 2>/dev/null || true
  systemctl stop  "getty@tty${n}.service" 2>/dev/null || true
done

echo "  [escape] Disabling SysRq (kernel.sysrq=0)"
sysctl -w kernel.sysrq=0
SYSCTL_CONF="/etc/sysctl.d/99-exam-kiosk.conf"
cat > "$SYSCTL_CONF" <<'EOF'
# Secure Exam Kiosk — lab console hardening
kernel.sysrq = 0
EOF

echo "  [escape] Disabling Ctrl+Alt+Del reboot"
systemctl mask ctrl-alt-del.target 2>/dev/null || true

echo "  [escape] Disabling Ctrl+Alt+Backspace (X11 zap)"
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/99-no-zap.conf <<'EOF'
Section "ServerFlags"
    Option "DontZap" "true"
EndSection
EOF

sysctl --system >/dev/null 2>&1 || true
echo "  ✅ Lab escape paths hardened. Revert anytime with rollback-exam-kiosk.sh."
