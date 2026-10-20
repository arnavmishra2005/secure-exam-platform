# Linux Kiosk — Deployment Runbook

> **Scope**: Person C — Linux OS-level kiosk hardening for the Secure Exam Platform.  
> Windows kiosk is deferred. Code execution / grading / backend monitoring are out of scope here.

---

## Overview

```
infra/linux-kiosk/
├── setup-exam-kiosk.sh          ← Main provisioning script (run as root)
├── kiosk-session/
│   ├── cage-session.sh          ← Wayland session (preferred — cage compositor)
│   └── x11-session.sh           ← X11 fallback (openbox kiosk mode)
├── disable-escapes.sh           ← Blocks VT switching, SysRq, Ctrl+Alt+Del/Backspace
├── usb-block.rules              ← udev: block USB mass storage, allow HID
├── nftables-exam.conf           ← Per-UID egress firewall (exam user → API + DNS only)
└── README.md                    ← This file
```

The **Electron app** (`apps/exam-client/`) enforces:
- Kiosk window (fullscreen, no frame, always-on-top, no close button)
- Input guard (blocks Alt+F4, Alt+Tab, F5, Ctrl+R, DevTools shortcuts, Super key)
- Navigation guard (blocks external URLs, popups, context menu)
- Focus monitor (forces focus back after blur in 200ms)
- Display monitor (detects external display added/removed)
- Readiness checks (single display, no forbidden processes, backend reachable)
- Preload bridge (`window.desktop`) for renderer ↔ main IPC

---

## Prerequisites

| Item | Requirement |
|------|-------------|
| OS | Ubuntu 22.04 LTS or Debian 12 (64-bit) |
| RAM | ≥ 4 GB |
| Disk | ≥ 20 GB |
| Network | LAN access to API server (port 3000) |
| Electron AppImage | Built from `apps/exam-client/` (see Building section) |

---

## Step 1 — Build the Electron AppImage (on dev machine)

```bash
# In the repo root:
cd apps/exam-client

# Install Electron dependencies (first time only)
npm install

# Build the renderer
npm run build:renderer     # builds apps/exam-client/renderer → renderer/dist/

# Package the Electron app as AppImage
npm run desktop:build      # produces dist/SecureExam-*.AppImage
```

Copy the resulting `.AppImage` file to the lab machine (e.g., via USB before provisioning, or scp after network is set up).

---

## Step 2 — Physical / BIOS Hardening (manual, before OS install)

> [!CAUTION]
> These steps must be done before provisioning. Skipping them means a student can boot from USB or enter BIOS settings.

1. **Set a BIOS/UEFI password** — prevents entering BIOS setup.
2. **Disable USB boot** in BIOS boot order — or enable Secure Boot.
3. **Disable network boot (PXE)** if not needed.
4. **Set GRUB password**:
   ```bash
   grub-mkpasswd-pbkdf2    # generates hash
   # Add to /etc/grub.d/40_custom:
   # set superusers="admin"
   # password_pbkdf2 admin <hash>
   update-grub
   ```

---

## Step 3 — Run the Provisioning Script

```bash
# Transfer scripts to the lab machine first
scp -r infra/linux-kiosk/ labmachine:/tmp/linux-kiosk/
scp dist/SecureExam-*.AppImage labmachine:/tmp/SecureExam.AppImage

# On the lab machine:
sudo bash /tmp/linux-kiosk/setup-exam-kiosk.sh \
    /tmp/SecureExam.AppImage \
    http://192.168.1.100:3000    # ← replace with your API server IP
```

The script will:
1. Create an unprivileged `exam` OS user (locked password, no login shell)
2. Install `cage`, `openbox`, `xorg`, `nftables`
3. Copy AppImage to `/opt/secure-exam/SecureExam.AppImage`
4. Configure **systemd autologin** on TTY1 for the `exam` user
5. Install `exam-kiosk.service` (systemd user service) + `.bashrc` fallback
6. Apply nftables firewall rules
7. Install USB block udev rules
8. Call `disable-escapes.sh` to mask VT gettys, disable SysRq, Ctrl+Alt+Del

---

## Step 4 — Set the Invigilator PIN

The PIN protects the "Exit Kiosk" button inside the Electron app.

```bash
# Edit the systemd user service for the exam user
sudo nano /home/exam/.config/systemd/user/exam-kiosk.service
# Change: Environment=INVIGILATOR_PIN=1234
# To:     Environment=INVIGILATOR_PIN=<your-secure-pin>

# Reload
sudo loginctl enable-linger exam
sudo -u exam XDG_RUNTIME_DIR=/run/user/$(id -u exam) \
    systemctl --user daemon-reload
```

---

## Step 5 — Reboot and Verify

```bash
sudo reboot
```

After reboot, the machine should:
- Boot directly into the kiosk session (TTY1, Wayland via cage or X11)
- Show the Secure Exam app fullscreen with no taskbar/decorations
- Pass all readiness checks before allowing exam start

### Verification Matrix

| Check | Expected | How to verify |
|-------|----------|---------------|
| No desktop shell | Only exam app visible | Look at screen |
| Alt+Tab blocked | Window doesn't switch | Press Alt+Tab |
| Alt+F4 blocked | Window stays open | Press Alt+F4 |
| VT switching blocked | Ctrl+Alt+F2 does nothing | Press Ctrl+Alt+F2 |
| SysRq disabled | `cat /proc/sys/kernel/sysrq` → `0` | SSH in as root |
| USB stick blocked | Plugging USB drive shows no mount | Plug USB stick |
| Firewall active | `nft list ruleset` shows exam_filter | SSH in as root |
| External display | Readiness check fails if 2nd display added | Connect HDMI |
| Forbidden process | Discord/OBS detected → readiness fail | Install & run Discord |
| Invigilator PIN | Exit dialog requires correct PIN | Click Exit in app |

---

## Session Flow

```
Boot → TTY1 autologin (exam user)
  └─► cage-session.sh (Wayland) OR x11-session.sh (X11)
        └─► SecureExam.AppImage
              ├─► ReadinessGate (checks: display count, processes, backend)
              ├─► Student enters Exam ID → /exam
              ├─► ViolationBanner monitors: focus, display, nav, shortcuts
              └─► Invigilator enters PIN → exit()
```

---

## Rollback / Recovery

To recover a machine (e.g., after exam or if kiosk is stuck):

```bash
# SSH in as root from another machine on the same LAN
ssh root@<lab-machine-ip>

# Stop the kiosk service
loginctl enable-linger exam
XDG_RUNTIME_DIR=/run/user/$(id -u exam) \
  sudo -u exam systemctl --user stop exam-kiosk.service

# Remove autologin to get normal TTY login back
rm /etc/systemd/system/getty@tty1.service.d/autologin.conf
systemctl daemon-reload
systemctl restart getty@tty1.service
```

---

## Building from Scratch

```bash
# Full dev workflow (on dev machine, not kiosk)
npm run api:start          # terminal 1 — NestJS API on :3000
npm run client:dev         # terminal 2 — Vite renderer on :5173
npm run client:desktop     # terminal 3 — Electron dev shell (loads :5173)
```

`npm run client:desktop` uses `wait-on` to wait for the Vite server before launching Electron.

---

## Firewall Notes

The nftables config (`nftables-exam.conf`) restricts the `exam` OS user's outbound traffic to:
- `TCP :3000` — API server
- `UDP/TCP :53` — DNS resolution

All other outbound from `exam` uid is dropped. Other users (root, sysadmin) are unrestricted.

To allow a different API port, edit `define API_PORT` in `/etc/nftables.conf`.

---

## Known Limitations

- **`setContentProtection`** (prevents screen capture) is not available on Linux in Electron — rely on OS-level kiosk (cage/X11 fullscreen) and physical camera policies instead.
- **Wayland preferred**: `cage` provides stronger isolation than X11; fall back to X11 only on older hardware.
- **No automatic USB re-enable**: after the exam, a reboot or `udevadm trigger` clears the USB block. Invigilators can plug USB after rebooting to recovery mode.
- **nftables UID matching** requires nft ≥ 0.9.3 and kernel ≥ 4.10. Verify with `nft --version`.

