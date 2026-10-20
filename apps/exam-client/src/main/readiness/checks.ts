import { screen } from 'electron';
import { net } from 'electron';
import { linuxSecurity } from '../platform/linux';
import type { ReadinessResult } from '../../shared/types';

const API_URL = process.env.EXAM_API_URL ?? 'http://localhost:3000';

async function checkBackendReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = net.request(`${API_URL}/health`);
    req.on('response', () => resolve(true));
    req.on('error', () => resolve(false));
    // 5-second timeout
    setTimeout(() => resolve(false), 5000);
    req.end();
  });
}

export async function runReadinessChecks(): Promise<ReadinessResult> {
  const [forbidden, backendReachable] = await Promise.all([
    linuxSecurity.scanForbiddenProcesses(),
    checkBackendReachable(),
  ]);

  const singleDisplay = screen.getAllDisplays().length === 1;

  return {
    ok: singleDisplay && backendReachable && forbidden.length === 0,
    checks: {
      singleDisplay,
      backendReachable,
      noForbiddenProcesses: forbidden.length === 0,
    },
  };
}

