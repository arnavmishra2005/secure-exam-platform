/**
 * Owner: Person B. Monaco editor wrapper.
 *
 * `hardened` (exam mode): paste is allowed only for text copied inside this
 * editor, and the context menu is off. Blocked pastes are reported through
 * `onBlockedPaste` so the host can log them. This is a deterrent in the
 * browser; the Electron kiosk is the real control.
 */
import './monacoSetup';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { Spinner } from '../../ui';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string | number;
  hardened?: boolean;
  onBlockedPaste?: () => void;
  ariaLabel?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = 'python',
  readOnly,
  height = '100%',
  hardened,
  onBlockedPaste,
  ariaLabel = 'Code editor',
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const internalClipboard = useRef<string | null>(null);

  const onMount = useCallback<OnMount>((editor) => {
    editorRef.current = editor;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hardened) return;

    const remember = () => {
      const editor = editorRef.current;
      const selection = editor?.getSelection();
      const model = editor?.getModel();
      if (!editor || !selection || !model) return;
      // Monaco copies the whole line when nothing is selected.
      internalClipboard.current = selection.isEmpty()
        ? model.getLineContent(selection.startLineNumber) + model.getEOL()
        : model.getValueInRange(selection);
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text && text !== internalClipboard.current) {
        e.preventDefault();
        e.stopPropagation();
        onBlockedPaste?.();
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onBlockedPaste?.();
    };

    el.addEventListener('copy', remember, true);
    el.addEventListener('cut', remember, true);
    el.addEventListener('paste', onPaste, true);
    el.addEventListener('drop', onDrop, true);
    return () => {
      el.removeEventListener('copy', remember, true);
      el.removeEventListener('cut', remember, true);
      el.removeEventListener('paste', onPaste, true);
      el.removeEventListener('drop', onDrop, true);
    };
  }, [hardened, onBlockedPaste]);

  return (
    <div ref={containerRef} className="h-full min-h-[200px] overflow-hidden rounded-md border border-border">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        onMount={onMount}
        loading={<Spinner />}
        options={{
          readOnly,
          ariaLabel,
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 4,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          contextmenu: !hardened,
          dragAndDrop: !hardened,
          renderWhitespace: 'selection',
        }}
      />
    </div>
  );
}
