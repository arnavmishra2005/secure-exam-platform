// Serves the built apps/web from app://exam/. apps/web uses a browser router,
// which does not work from file://, and a real origin keeps IndexedDB and
// Monaco's web workers working. Unknown paths fall back to index.html (SPA).

import { net, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { APP_SCHEME, WEB_DIST_DIR } from './config';

/** Must run before app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Must run after app is ready. */
export function installAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const requested = path.normalize(path.join(WEB_DIST_DIR, decodeURIComponent(pathname)));
    // Never serve anything outside the build directory.
    const inside = requested === WEB_DIST_DIR || requested.startsWith(WEB_DIST_DIR + path.sep);
    const file = inside && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(WEB_DIST_DIR, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
}
