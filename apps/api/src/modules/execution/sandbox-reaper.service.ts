/**
 * Owner: Person B.
 *
 * Every minute, removes sandbox containers that outlived their deadline.
 * The provider already kills a container at its deadline, but if the API
 * restarts mid-run (or `docker kill` fails), the container could keep
 * burning CPU on the runner host. Containers are found by label, so the
 * reaper never touches anything else on that Docker host.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { RUNNER_DEADLINE_LABEL, RUNNER_LABEL } from './docker-runner.provider';

/** Extra time past the deadline before a container counts as leftover. */
const GRACE_MS = 30_000;
const REAP_INTERVAL_MS = 60_000;

/** Names of containers past their deadline, from `docker ps` lines "<name> <deadline ms>". */
export function overdueContainers(psOutput: string, now: number, graceMs = GRACE_MS): string[] {
  const overdue: string[] = [];
  for (const line of psOutput.split('\n')) {
    const [name, deadline] = line.trim().split(/\s+/);
    if (!name) continue;
    const due = Number(deadline);
    // A container with no readable deadline is ours but broken: remove it too.
    if (!Number.isFinite(due) || now > due + graceMs) overdue.push(name);
  }
  return overdue;
}

@Injectable()
export class SandboxReaperService {
  private readonly logger = new Logger(SandboxReaperService.name);
  private running = false;

  constructor(private readonly config: ConfigService) {}

  @Interval(REAP_INTERVAL_MS)
  async reap(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const ps = await this.docker([
        'ps', '--no-trunc',
        '--filter', `label=${RUNNER_LABEL}=1`,
        '--format', `{{.Names}} {{.Label "${RUNNER_DEADLINE_LABEL}"}}`,
      ]);
      const names = overdueContainers(ps, Date.now());
      if (names.length === 0) return 0;
      await this.docker(['rm', '-f', ...names]);
      this.logger.warn(`Removed ${names.length} sandbox container(s) past their deadline: ${names.join(', ')}`);
      return names.length;
    } catch (err) {
      // Docker down is reported by the runs themselves; keep this quiet.
      this.logger.debug(`Reaper skipped: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private docker(args: string[]): Promise<string> {
    const bin = this.config.get<string>('RUNNER_DOCKER_BIN') ?? 'docker';
    return new Promise((resolve, reject) => {
      execFile(bin, args, { timeout: 20_000, maxBuffer: 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
  }
}
