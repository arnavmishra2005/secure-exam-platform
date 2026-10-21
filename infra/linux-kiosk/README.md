# Linux Kiosk — Deployment Runbook & Safe Testing Guide

> **Scope**: Linux OS- and session-level kiosk hardening for the Secure Exam Platform.
> Provides Safe Exam Browser-like isolation on Linux without permanently altering or damaging normal Ubuntu workstations.

---

## Architecture Overview

```
infra/linux-kiosk/
├── setup-exam-kiosk.sh          ← Non-destructive provisioning script (opt-in)
├── rollback-exam-kiosk.sh       ← 100% reversible uninstaller / system restore script
├── run-kiosk-test.sh            ← Safe user-space testing tool (nested, no root required)
├── disable-escapes.sh           ← Optional lab PC hardening (requires --confirm-lab-hardening)
├── sessions/
│   ├── secure-exam-session.sh   ← Display manager session dispatcher (Wayland/X11)
│   ├── secure-exam-kiosk-wayland.desktop ← GDM/LightDM Wayland session entry
│   └── secure-exam-kiosk-x11.desktop     ← GDM/LightDM X11 session entry
├── kiosk-session/
│   ├── cage-session.sh          ← Wayland kiosk session (cage compositor, sandboxed)
│   └── x11-session.sh           ← X11 fallback (isolated openbox rc.xml, sandboxed)
├── usb-block.rules              ← udev mass storage block (non-destructive, no rmmod)
├── nftables-exam.conf           ← Isolated 'secure_exam_filter' table (per-UID egress only)
└── README.md                    ← This runbook
```

---

## Deployment Modes

### Mode 1: Safe Desktop Session (Recommended for Workstations / Everyday PCs)
- **Zero changes to your default Ubuntu desktop or shell.**
- Registers an opt-in session (`Secure Exam Kiosk`) in your display manager (GDM/LightDM/SDDM).
- The user logs in normally before an exam.
- To take an exam: Log out, choose **"Secure Exam Kiosk"** at the login screen, and log in.
- The session launches the exam in Cage (Wayland) or isolated Openbox (X11):
  - No window decorations, no desktop shell, no workspaces.
  - Global shortcuts (`Alt+Tab`, `Alt+F4`, `Super`, etc.) suppressed at the compositor level.
  - Chromium multi-process sandbox remains **active and intact** (no `--no-sandbox`).
- When the exam is submitted or an invigilator enters the PIN, the app exits with status 0, the session ends cleanly, and the display manager returns to the login screen. Normal Ubuntu desktop is completely unharmed.

### Mode 2: Dedicated Lab Machine (Automated Lab Kiosk)
- For disposable or dedicated lab computers only.
- Run with `--enable-autologin` and optional `--lab-hardening`:
  ```bash
  sudo bash infra/linux-kiosk/setup-exam-kiosk.sh --enable-autologin --lab-hardening \
      /path/to/SecureExam.AppImage http://<api-server-ip>:3000
  ```
- Fully reversible at any time by running:
  ```bash
  sudo bash infra/linux-kiosk/rollback-exam-kiosk.sh
  ```

---

## Safe Testing Instructions

### 1. Development Mode (Non-destructive, User-space)
Run the Vite renderer and Electron app without kiosk traps:
```bash
npm run api:start      # Terminal 1: NestJS API (:3000)
npm run client:dev     # Terminal 2: Vite dev server (:5173)
npm run client:desktop # Terminal 3: Electron dev shell
```
*In dev mode, window controls and DevTools remain accessible.*

### 2. Nested Kiosk Window Test (Unprivileged, No Root)
Test the kiosk session inside a nested window without altering the host desktop:
```bash
bash infra/linux-kiosk/run-kiosk-test.sh
```
- If running under Wayland, launches nested inside a Cage window.
- If Xephyr is available, launches an isolated X11 test screen on `:2`.
- Verifies shortcut suppression and exit flow without system modifications.

### 3. Disposable VM Full Lockdown Testing
For testing system-level provisioning (`setup-exam-kiosk.sh`):
1. Use an Ubuntu 22.04 LTS or 24.04 VM (VirtualBox or QEMU/KVM).
2. Take a VM snapshot.
3. Run `sudo bash infra/linux-kiosk/setup-exam-kiosk.sh /tmp/SecureExam.AppImage http://192.168.1.100:3000`.
4. Test session launch, network egress rules, and exit flow.
5. Run `sudo bash infra/linux-kiosk/rollback-exam-kiosk.sh --purge` to verify complete cleanup.

---

## Exit and Recovery Procedures

### Standard Exit Flows
1. **Upon Successful Submission:**
   - Once answers are submitted, the `SubmittedPage` displays an **"Exit Exam & Return to Desktop"** button.
   - Clicking it calls `desktop.exitKiosk()`, closing the window and terminating the kiosk session cleanly.
2. **Invigilator Exit During Active Exam:**
   - Click the "Exit Kiosk" button at the bottom-right corner of the exam screen.
   - Enter the invigilator PIN (default: `1234` or set via `INVIGILATOR_PIN`).
   - The application immediately closes and returns to the desktop/login screen.

### System Rollback
If provisioned via `setup-exam-kiosk.sh`, running `rollback-exam-kiosk.sh` restores:
- Systemd TTY1 autologin overrides removed.
- All masked TTY consoles (`tty2`–`tty6`) and `ctrl-alt-del.target` unmasked and restarted.
- `/etc/sysctl.d/99-exam-kiosk.conf` removed and `kernel.sysrq` restored.
- udev USB storage blocking rules removed and reloaded.
- Isolated nftables table `secure_exam_filter` deleted (`nft delete table inet secure_exam_filter`).
- Display manager session entries removed.
- Kiosk user services stopped and disabled.

---

## Security & Firewall Specifications

- **Chromium Sandbox:** Kept active across both Cage and X11 sessions.
- **Firewall Isolation:** The `secure_exam_filter` nftables table restricts **only** the `exam` OS user's outbound traffic to TCP 3000 (API) and UDP/TCP 53 (DNS). Host inbound traffic (including SSH) and all other users remain unrestricted.
- **USB Device Policy:** Mass storage interfaces (class 08) are blocked from automounting via udev authorization rules without unloading kernel modules. Keyboards and mice remain operational.
