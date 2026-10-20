import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PlatformSecurity } from './PlatformSecurity';

const execFileAsync = promisify(execFile);

// Processes that indicate a student may be cheating or screen-sharing.
const FORBIDDEN_PROCESS_NAMES = [
  'discord', 'slack', 'teams', 'zoom', 'skype',
  'obs', 'obs-studio', 'kazam', 'recordmydesktop',
  'teamviewer', 'anydesk', 'rustdesk', 'remmina',
  'telegram', 'whatsapp', 'signal',
  'xterm', 'konsole', 'gnome-terminal', 'xfce4-terminal', 'alacritty', 'kitty',
];

export const linuxSecurity: PlatformSecurity = {
  async scanForbiddenProcesses(): Promise<string[]> {
    try {
      // Read /proc/<pid>/comm for every running process — no external binary needed.
      const { stdout } = await execFileAsync('bash', [
        '-c',
        "cat /proc/*/comm 2>/dev/null | sort -u",
      ]);
      const running = stdout.toLowerCase().split('\n').map((s) => s.trim());
      return FORBIDDEN_PROCESS_NAMES.filter((name) =>
        running.some((proc) => proc.includes(name)),
      );
    } catch {
      return []; // /proc unavailable (shouldn't happen on Linux)
    }
  },

  detectSessionType(): 'x11' | 'wayland' | 'unknown' {
    const wayland = process.env.WAYLAND_DISPLAY;
    const x11 = process.env.DISPLAY;
    if (wayland) return 'wayland';
    if (x11) return 'x11';
    return 'unknown';
  },
};

