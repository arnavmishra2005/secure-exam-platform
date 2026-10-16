// Deep ESM entry points of monaco-editor have no bundled typings.
declare module 'monaco-editor/esm/vs/editor/edcore.main' {
  export * from 'monaco-editor';
}
declare module 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
