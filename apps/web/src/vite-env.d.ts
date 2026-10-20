/// <reference types="vite/client" />
// Monaco module shims shipped with Person B's exam-content-ui package.
/// <reference path="../../../packages/exam-content-ui/src/coding/editor/monaco-modules.d.ts" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_HEARTBEAT_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
