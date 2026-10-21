// Shared runtime configuration for the main process.

import { app } from 'electron';
import * as path from 'path';

/** Development = running from source. NODE_ENV is not set in a packaged app, so don't use it. */
export const IS_DEV = !app.isPackaged;

/** The exam API. Also where the readiness check pings /health. */
export const API_URL = process.env.EXAM_API_URL ?? 'http://localhost:3000';

/** Vite dev server for apps/web. */
export const WEB_DEV_URL = process.env.EXAM_WEB_URL ?? 'http://localhost:3003';

/** Production serves the built apps/web from this custom scheme (see appProtocol.ts). */
export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://exam`;

/** Built apps/web (workspace build output, or bundled next to the app when packaged). */
export const WEB_DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.resolve(__dirname, '../../../web/dist');

/** Origins the page may talk to or navigate within. */
export const ALLOWED_ORIGINS = [new URL(API_URL).origin, IS_DEV ? new URL(WEB_DEV_URL).origin : APP_ORIGIN];

/** Sent on every API request so the server can refuse administrator sessions in the exam app. */
export const CLIENT_TYPE_HEADER = 'X-Client-Type';
