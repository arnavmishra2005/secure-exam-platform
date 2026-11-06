import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../apps/exam-client/', import.meta.url);
mkdirSync(fileURLToPath(new URL('dist/main/platform/', root)), { recursive: true });
copyFileSync(new URL('src/main/platform/gnome-shortcut-worker.py', root), new URL('dist/main/platform/gnome-shortcut-worker.py', root));
