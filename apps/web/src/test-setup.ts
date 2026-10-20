import { vi } from 'vitest';

// Person B's code editor (Monaco) needs workers and real layout, which jsdom
// lacks. Importing the exam-content-ui barrel would otherwise crash any test
// that loads the router. Same stand-in as the package's own tests.
vi.mock('../../../packages/exam-content-ui/src/coding/editor/monacoSetup', () => ({}));
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  return {
    default: ({ value, onChange, options }: { value: string; onChange?: (v: string) => void; options?: { readOnly?: boolean; ariaLabel?: string } }) =>
      React.createElement('textarea', {
        'aria-label': options?.ariaLabel ?? 'Code editor',
        value,
        readOnly: options?.readOnly,
        onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
      }),
    loader: { config: () => undefined },
  };
});
