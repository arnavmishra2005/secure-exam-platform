#!/usr/bin/env bash
# setup-exam-kiosk.sh — provision a Linux machine as an exam kiosk
# Run as root on a fresh Ubuntu 22.04 / Debian 12 machine.
# Usage: sudo bash setup-exam-kiosk.sh [APPIMAGE_PATH] [API_URL]
#
# What it does:
#   1. Creates an unprivileged 'exam' OS user (no password, no shell)
#   2. Installs required packages (cage, openbox, xorg, xinit, nftables)
#   3. Copies the Electron AppImage and marks it executable
#   4. Sets up systemd autologin for the 'exam' user on TTY1
#   5. Installs the kiosk session as a systemd user service
#   6. Copies firewall rules (nftables) and enables them
#   7. Applies USB-block udev rules
#   8. Calls disable-escapes.sh to harden the TTY environment
#   9. Enables the kiosk on next boot
#
# BIOS / GRUB hardening is manual — see README.md.

set -euo pipefail

APPIMAGE="${1:-/tmp/SecureExam.AppImage}"
API_URL="${2:-http://192.168.1.100:3000}"
EXAM_USER="exam"
INSTALL_DIR="/opt/secure-exam"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 0. Must be root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root (sudo bash $0)" >&2
  exit 1
fi

echo "==> [1/9] Creating exam user"
if ! id "$EXAM_USER" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin \
          --comment "Secure Exam Kiosk" "$EXAM_USER"
fi
# Lock password so nobody can su to it
passwd -l "$EXAM_USER"

echo "==> [2/9] Installing packages"
apt-get update -qq
apt-get install -y --no-install-recommends \
  cage \
  openbox \
  xorg \
  xinit \
  nftables \
  usbutils \
  2>/dev/null || true
# cage = Wayland kiosk compositor; xorg/xinit/openbox = X11 fallback

echo "==> [3/9] Installing Electron AppImage"
mkdir -p "$INSTALL_DIR"
if [[ -f "$APPIMAGE" ]]; then
  cp "$APPIMAGE" "$INSTALL_DIR/SecureExam.AppImage"
  chmod +x "$INSTALL_DIR/SecureExam.AppImage"
  chown root:root "$INSTALL_DIR/SecureExam.AppImage"
else
  echo "WARN: AppImage not found at $APPIMAGE — copy it to $INSTALL_DIR/SecureExam.AppImage manually."
fi

echo "==> [4/9] Configuring systemd TTY1 autologin for '$EXAM_USER'"
GETTY_DROP="/etc/systemd/system/getty@tty1.service.d"
mkdir -p "$GETTY_DROP"
cat > "$GETTY_DROP/autologin.conf" <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $EXAM_USER --noclear %I \$TERM
EOF

echo "==> [5/9] Installing kiosk session systemd user service"
USER_SYSTEMD="/home/$EXAM_USER/.config/systemd/user"
mkdir -p "$USER_SYSTEMD"

# Detect if Wayland (cage) or X11 should be preferred
# cage is tried first; falls back to X11 session script.
SESSION_SCRIPT="$SCRIPT_DIR/kiosk-session/cage-session.sh"
if ! command -v cage &>/dev/null; then
  echo "  cage not found, falling back to X11 session"
  SESSION_SCRIPT="$SCRIPT_DIR/kiosk-session/x11-session.sh"
fi
chmod +x "$SCRIPT_DIR/kiosk-session/cage-session.sh" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/kiosk-session/x11-session.sh" 2>/dev/null || true

cat > "$USER_SYSTEMD/exam-kiosk.service" <<EOF
[Unit]
Description=Secure Exam Kiosk Session
After=graphical-session.target

[Service]
Type=simple
Environment=INVIGILATOR_PIN=1234
Environment=API_URL=$API_URL
Environment=INSTALL_DIR=$INSTALL_DIR
ExecStart=$SESSION_SCRIPT
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

chown -R "$EXAM_USER:$EXAM_USER" "/home/$EXAM_USER/.config"

# Enable lingering so user services start on boot without full login session
loginctl enable-linger "$EXAM_USER"
# Enable the kiosk service for the exam user
su -l "$EXAM_USER" -s /bin/bash -c \
  "XDG_RUNTIME_DIR=/run/user/$(id -u $EXAM_USER) systemctl --user enable exam-kiosk.service" 2>/dev/null || \
  echo "  WARN: systemctl --user enable failed — service will start via .bashrc autologin fallback"

# .bashrc fallback: if systemd --user doesn't start the session, bash on TTY1 will
BASHRC="/home/$EXAM_USER/.bashrc"
cat >> "$BASHRC" <<'EOF'

# ── Kiosk autologin fallback ─────────────────────────────────────────────────
if [[ "$(tty)" == "/dev/tty1" ]] && [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  exec "$KIOSK_SESSION_SCRIPT"
fi
EOF
sed -i "s|KIOSK_SESSION_SCRIPT|$SESSION_SCRIPT|g" "$BASHRC"
chown "$EXAM_USER:$EXAM_USER" "$BASHRC"

echo "==> [6/9] Applying nftables egress firewall"
NFTABLES_CONF="$SCRIPT_DIR/nftables-exam.conf"
if [[ -f "$NFTABLES_CONF" ]]; then
  # Substitute exam user UID into the config
  EXAM_UID=$(id -u "$EXAM_USER")
  sed "s/__EXAM_UID__/$EXAM_UID/g" "$NFTABLES_CONF" > /etc/nftables.conf
  systemctl enable nftables
  nft -f /etc/nftables.conf || echo "  WARN: nftables load failed — check /etc/nftables.conf"
else
  echo "  WARN: nftables-exam.conf not found at $NFTABLES_CONF"
fi

echo "==> [7/9] Installing USB block udev rules"
USB_RULES="$SCRIPT_DIR/usb-block.rules"
if [[ -f "$USB_RULES" ]]; then
  cp "$USB_RULES" /etc/udev/rules.d/99-exam-usb-block.rules
  udevadm control --reload-rules
  udevadm trigger
else
  echo "  WARN: usb-block.rules not found"
fi

echo "==> [8/9] Hardening TTY escape paths"
DISABLE_SCRIPT="$SCRIPT_DIR/disable-escapes.sh"
if [[ -f "$DISABLE_SCRIPT" ]]; then
  bash "$DISABLE_SCRIPT"
else
  echo "  WARN: disable-escapes.sh not found"
fi

echo "==> [9/9] Enabling graphical target and reloading systemd"
systemctl set-default graphical.target || true
systemctl daemon-reload

echo ""
echo "✅  Kiosk provisioning complete."
echo "   Reboot the machine to start the kiosk session automatically."
echo ""
echo "   Manual steps still required (see README.md):"
echo "   - Set BIOS password and disable USB boot"
echo "   - Set GRUB password"
echo "   - Change INVIGILATOR_PIN in /home/exam/.config/systemd/user/exam-kiosk.service"
echo "   - Copy the Electron AppImage to $INSTALL_DIR/SecureExam.AppImage if not done above"

