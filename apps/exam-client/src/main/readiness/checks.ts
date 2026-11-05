import { screen } from 'electron';
import { net } from 'electron';
import { linuxSecurity } from '../platform/linux';
import type { ReadinessResult } from '../../shared/types';

import { API_URL } from '../config';

async function checkBackendReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = net.request(`${API_URL}/health`);
    const timer = setTimeout(() => { req.abort(); resolve(false); }, 5000);
    req.on('response', response => { clearTimeout(timer); resolve(response.statusCode >= 200 && response.statusCode < 300); });
    req.on('error', () => { clearTimeout(timer); resolve(false); });
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
    // ponytail: backendReachable is informational only — exam can start offline/demo
    ok: singleDisplay && forbidden.length === 0,
    checks: {
      singleDisplay,
      backendReachable,
      noForbiddenProcesses: forbidden.length === 0,
      forbiddenList: forbidden,
    },
  };
}

