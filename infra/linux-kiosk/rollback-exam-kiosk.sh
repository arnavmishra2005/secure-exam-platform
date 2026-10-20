#!/usr/bin/env bash
# rollback-exam-kiosk.sh — safely and completely restore Ubuntu to its normal state
# Run as root: sudo bash rollback-exam-kiosk.sh [--purge]

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root (sudo bash $0)" >&2
  exit 1
fi

EXAM_USER="exam"
INSTALL_DIR="/opt/secure-exam"
PURGE="${1:-}"

echo "==> [1/7] Stopping and disabling kiosk user service"
if id "$EXAM_USER" &>/dev/null; then
  EXAM_UID=$(id -u "$EXAM_USER")
  loginctl disable-linger "$EXAM_USER" 2>/dev/null || true
  su -l "$EXAM_USER" -s /bin/bash -c \
    "XDG_RUNTIME_DIR=/run/user/$EXAM_UID systemctl --user stop exam-kiosk.service 2>/dev/null || true" 2>/dev/null || true
  su -l "$EXAM_USER" -s /bin/bash -c \
    "XDG_RUNTIME_DIR=/run/user/$EXAM_UID systemctl --user disable exam-kiosk.service 2>/dev/null || true" 2>/dev/null || true
  rm -f "/home/$EXAM_USER/.config/systemd/user/exam-kiosk.service"
fi

echo "==> [2/7] Removing TTY1 autologin overrides"
if [[ -f "/etc/systemd/system/getty@tty1.service.d/autologin.conf" ]]; then
  rm -f "/etc/systemd/system/getty@tty1.service.d/autologin.conf"
  rmdir "/etc/systemd/system/getty@tty1.service.d" 2>/dev/null || true
fi

echo "==> [3/7] Restoring TTY consoles and emergency shortcuts"
for n in 2 3 4 5 6; do
  systemctl unmask "getty@tty${n}.service" 2>/dev/null || true
  systemctl restart "getty@tty${n}.service" 2>/dev/null || true
done
systemctl unmask ctrl-alt-del.target 2>/dev/null || true

rm -f /etc/sysctl.d/99-exam-kiosk.conf
sysctl --system >/dev/null 2>&1 || true

rm -f /etc/X11/xorg.conf.d/99-no-zap.conf

echo "==> [4/7] Restoring USB device rules"
if [[ -f "/etc/udev/rules.d/99-exam-usb-block.rules" ]]; then
  rm -f "/etc/udev/rules.d/99-exam-usb-block.rules"
  udevadm control --reload-rules 2>/dev/null || true
  udevadm trigger 2>/dev/null || true
fi

echo "==> [5/7] Removing exam firewall rules"
nft delete table inet secure_exam_filter 2>/dev/null || true
rm -f /etc/nftables.d/secure_exam_filter.conf 2>/dev/null || true
rm -f /etc/nftables/secure_exam_filter.conf 2>/dev/null || true

echo "==> [6/7] Removing Desktop Session entries"
rm -f /usr/share/wayland-sessions/secure-exam-kiosk-wayland.desktop
rm -f /usr/share/xsessions/secure-exam-kiosk-x11.desktop
rm -f /usr/local/bin/secure-exam-session

echo "==> [7/7] Reloading systemd daemon"
systemctl daemon-reload
systemctl restart getty@tty1.service 2>/dev/null || true

if [[ "$PURGE" == "--purge" ]]; then
  echo "==> [Purge] Removing exam user and installation directory"
  rm -rf "$INSTALL_DIR"
  userdel -r "$EXAM_USER" 2>/dev/null || true
fi

echo ""
echo "✅ Rollback complete. Normal Ubuntu desktop and system configuration fully restored."

