import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Monaco needs workers and real layout; jsdom has neither. Swap in a textarea
// with the same value/onChange contract.
vi.mock('../coding/editor/monacoSetup', () => ({}));
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

afterEach(() => cleanup());
