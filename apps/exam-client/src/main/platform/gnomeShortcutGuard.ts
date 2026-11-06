import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

// Python runs outside Electron and cannot read a file inside app.asar.
const workerPath = path.join(__dirname, 'gnome-shortcut-worker.py').replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');

/** The worker owns restoration independently of the Electron main process. */
export class GnomeShortcutGuard {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private stopped: Promise<void> = Promise.resolve();
  private releasing: Promise<void> | null = null;
  private wanted = false;
  readonly journal: string;

  constructor(userData: string, private readonly onFailure: (reason: string) => void) {
    this.journal = path.join(userData, 'gnome-shortcuts.json');
  }

  async recover(): Promise<void> {
    if (process.platform !== 'linux' || !existsSync(this.journal)) return;
    await this.run(true);
  }

  acquire(): Promise<void> {
    if (process.platform !== 'linux' || process.env.EXAM_KIOSK_SESSION === '1') return Promise.resolve();
    if (this.releasing) return this.releasing.then(() => this.acquire());
    if (this.ready) return this.ready;
    const desktop = `${process.env.XDG_CURRENT_DESKTOP ?? ''}:${process.env.DESKTOP_SESSION ?? ''}`;
    if (!/gnome|ubuntu/i.test(desktop)) {
      return Promise.reject(new Error('Automatic shortcut protection requires Ubuntu/GNOME. Use the managed Secure Exam session on other Linux desktops.'));
    }
    this.wanted = true;
    this.ready = this.stopped.then(() => {
      if (!this.wanted) throw new Error('Security setup cancelled');
      return this.run(false);
    });
    return this.ready;
  }

  release(): Promise<void> {
    if (this.releasing) return this.releasing;
    this.wanted = false;
    this.releasing = (async () => {
      // If acquisition is waiting for an older worker, cancel before it changes settings.
      this.child?.stdin.end();
      const pending = this.ready;
      if (pending) await pending.catch(() => {});
      this.child?.stdin.end();
      await this.stopped;
      this.ready = null;
    })().finally(() => { this.releasing = null; });
    return this.releasing;
  }

  private run(recoverOnly: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/python3', [workerPath, this.journal, ...(recoverOnly ? ['--recover'] : [])], {
        stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      });
      this.child = child;
      let releaseStopped!: () => void;
      this.stopped = new Promise<void>(done => { releaseStopped = done; });
      let acknowledged = false;
      let output = '', errors = '';
      const timeout = setTimeout(() => {
        child.stdin.end();
        reject(new Error('Desktop shortcut protection timed out; settings are being restored.'));
      }, 15_000);
      child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-2000); });
      child.stdout.on('data', chunk => {
        output += String(chunk);
        const lines = output.split('\n'); output = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const result = JSON.parse(line) as { ok: boolean; reason?: string };
            clearTimeout(timeout);
            if (result.ok) { acknowledged = true; resolve(); }
            else reject(new Error(result.reason ?? 'Desktop shortcut protection failed'));
          } catch (error) { if (!(error instanceof SyntaxError)) reject(error); }
        }
      });
      child.stdin.on('error', () => {}); // A failed worker may close its pipe first.
      child.once('error', error => {
        clearTimeout(timeout); releaseStopped(); this.child = null; reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timeout); releaseStopped(); this.child = null;
        const reason = errors || 'Desktop shortcut protection stopped unexpectedly. Restart the app to restore settings.';
        if (recoverOnly && code === 0) resolve();
        else if (!acknowledged) reject(new Error(reason));
        else if (this.wanted) { this.ready = null; this.onFailure(reason); }
        else if (code !== 0) console.error('Shortcut restoration needs recovery on next app launch:', this.journal, reason);
      });
    });
  }
}
