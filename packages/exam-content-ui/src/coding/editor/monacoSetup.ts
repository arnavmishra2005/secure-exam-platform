/**
 * Owner: Person B. Monaco bundled locally (no CDN), editor core + Python,
 * C, C++ and Java highlighting (#16; the cpp contribution registers both `c`
 * and `cpp`). Verified rendering under `script-src 'self'`; the host
 * CSP also needs `worker-src 'self' blob:` and `font-src 'self' data:`.
 * Add a language's `*.contribution` import here when it joins the registry.
 *
 * ~875 KB gzipped: host apps should lazy-load the routes that use the editor.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
