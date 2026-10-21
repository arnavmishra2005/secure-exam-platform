// The exam app keeps nothing between runs: the login, the cache and the offline copy of the
// answers are removed when it closes. (The server has everything that matters.)

import { session } from 'electron';

export async function wipeAppData(): Promise<void> {
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    console.log('[exam-app] stored login, cache and answers cleared');
  } catch (err) {
    console.warn('Could not clear the exam app data:', err);
  }
}
