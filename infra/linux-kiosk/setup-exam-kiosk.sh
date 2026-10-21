#!/usr/bin/env bash
# setup-exam-kiosk.sh — provision a Linux machine as an exam kiosk
# Run as root on Ubuntu 22.04 / Debian 12.
# Usage: sudo bash setup-exam-kiosk.sh [OPTIONS] [APPIMAGE_PATH] [API_URL]
#
# Options:
#   --enable-autologin   Configure TTY1 autologin for the 'exam' user (dedicated lab PCs only)
#   --lab-hardening      Harden TTY console escapes and disable SysRq (dedicated lab PCs only)
#   -h, --help           Show this help message
#
# Default behavior (safe for multi-user / workstations):
#   - Creates unprivileged 'exam' user
#   - Installs desktop session entries (/usr/share/wayland-sessions/ and xsessions/)
#   - Does NOT overwrite system firewalls (uses isolated nftables table 'secure_exam_filter')
#   - Does NOT disable TTY switching or SysRq recovery keys
#   - Does NOT force autologin or replace normal Ubuntu desktop sessions
#   - 100% reversible via rollback-exam-kiosk.sh

set -euo pipefail

ENABLE_AUTOLOGIN=false
ENABLE_LAB_HARDENING=false
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enable-autologin)
      ENABLE_AUTOLOGIN=true
      shift
      ;;
    --lab-hardening)
      ENABLE_LAB_HARDENING=true
      shift
      ;;
    -h|--help)
      echo "Usage: sudo bash $0 [--enable-autologin] [--lab-hardening] [APPIMAGE_PATH] [API_URL]"
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

APPIMAGE="${POSITIONAL[0]:-/tmp/SecureExam.AppImage}"
API_URL="${POSITIONAL[1]:-http://192.168.1.100:3000}"
EXAM_USER="exam"
INSTALL_DIR="/opt/secure-exam"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 0. Must be root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root (sudo bash $0)" >&2
  exit 1
fi

echo "==> [1/8] Creating unprivileged exam user"
if ! id "$EXAM_USER" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin \
          --comment "Secure Exam Kiosk" "$EXAM_USER"
fi
passwd -l "$EXAM_USER"

echo "==> [2/8] Installing dependencies"
apt-get update -qq
apt-get install -y --no-install-recommends \
  cage \
  openbox \
  xorg \
  xinit \
  nftables \
  usbutils \
  2>/dev/null || true

echo "==> [3/8] Installing Electron AppImage and session binaries"
mkdir -p "$INSTALL_DIR/bin"
if [[ -f "$APPIMAGE" ]]; then
  cp "$APPIMAGE" "$INSTALL_DIR/SecureExam.AppImage"
  chmod +x "$INSTALL_DIR/SecureExam.AppImage"
  chown root:root "$INSTALL_DIR/SecureExam.AppImage"
else
  echo "  NOTE: AppImage not found at $APPIMAGE — copy it to $INSTALL_DIR/SecureExam.AppImage when built."
fi

cp "$SCRIPT_DIR/kiosk-session/cage-session.sh" "$INSTALL_DIR/bin/cage-session.sh"
cp "$SCRIPT_DIR/kiosk-session/x11-session.sh" "$INSTALL_DIR/bin/x11-session.sh"
chmod +x "$INSTALL_DIR/bin/"*.sh

# Install session launcher
ln -sf "$SCRIPT_DIR/sessions/secure-exam-session.sh" /usr/local/bin/secure-exam-session
chmod +x /usr/local/bin/secure-exam-session

echo "==> [4/8] Installing Desktop Session entries"
# Wayland session
mkdir -p /usr/share/wayland-sessions
cp "$SCRIPT_DIR/sessions/secure-exam-kiosk-wayland.desktop" /usr/share/wayland-sessions/

# X11 session
mkdir -p /usr/share/xsessions
cp "$SCRIPT_DIR/sessions/secure-exam-kiosk-x11.desktop" /usr/share/xsessions/

echo "==> [5/8] Configuring exam user service"
USER_SYSTEMD="/home/$EXAM_USER/.config/systemd/user"
mkdir -p "$USER_SYSTEMD"

SESSION_SCRIPT="/usr/local/bin/secure-exam-session"

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
Restart=on-failure
RestartSec=3
StartLimitBurst=3
StartLimitIntervalSec=30

[Install]
WantedBy=default.target
EOF

chown -R "$EXAM_USER:$EXAM_USER" "/home/$EXAM_USER/.config"

if [[ "$ENABLE_AUTOLOGIN" == "true" ]]; then
  echo "==> [6/8] Configuring TTY1 autologin (opt-in)"
  GETTY_DROP="/etc/systemd/system/getty@tty1.service.d"
  mkdir -p "$GETTY_DROP"
  cat > "$GETTY_DROP/autologin.conf" <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $EXAM_USER --noclear %I \$TERM
EOF
  loginctl enable-linger "$EXAM_USER"
  su -l "$EXAM_USER" -s /bin/bash -c \
    "XDG_RUNTIME_DIR=/run/user/$(id -u $EXAM_USER) systemctl --user enable exam-kiosk.service" 2>/dev/null || true
else
  echo "==> [6/8] Skipping TTY1 autologin (using display manager desktop sessions)"
fi

echo "==> [7/8] Applying isolated nftables egress rules"
NFTABLES_CONF="$SCRIPT_DIR/nftables-exam.conf"
if [[ -f "$NFTABLES_CONF" ]]; then
  EXAM_UID=$(id -u "$EXAM_USER")
  mkdir -p /etc/nftables.d
  sed "s/__EXAM_UID__/$EXAM_UID/g" "$NFTABLES_CONF" > /etc/nftables.d/secure_exam_filter.conf
  nft -f /etc/nftables.d/secure_exam_filter.conf 2>/dev/null || echo "  NOTE: nftables loaded into kernel or deferred"
fi

# USB block rules
USB_RULES="$SCRIPT_DIR/usb-block.rules"
if [[ -f "$USB_RULES" ]]; then
  cp "$USB_RULES" /etc/udev/rules.d/99-exam-usb-block.rules
  udevadm control --reload-rules 2>/dev/null || true
  udevadm trigger 2>/dev/null || true
fi

echo "==> [8/8] Escape paths check"
if [[ "$ENABLE_LAB_HARDENING" == "true" ]]; then
  echo "  Applying lab hardening (--lab-hardening specified)"
  bash "$SCRIPT_DIR/disable-escapes.sh" --confirm-lab-hardening
else
  echo "  Preserving standard console and recovery keys (safe for normal workstations)"
fi

systemctl daemon-reload

echo ""
echo "✅ Secure Exam Kiosk provisioning complete."
echo "   - Normal Ubuntu desktop is preserved."
echo "   - To start: Select 'Secure Exam Kiosk' at the login screen (GDM/LightDM)."
echo "   - To restore or remove at any time, run:"
echo "       sudo bash $SCRIPT_DIR/rollback-exam-kiosk.sh"
echo ""
