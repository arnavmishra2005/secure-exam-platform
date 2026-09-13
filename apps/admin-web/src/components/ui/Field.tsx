// [SHARED — scaffold together Day 0]

'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-ash-muted">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`rounded border bg-paper-raised px-3 py-2 text-sm text-ash outline-none transition-colors ${
            error ? 'border-brick' : 'border-hairline focus:border-verdigris'
          } ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-brick">{error}</span>}
      </div>
    );
  },
);
Field.displayName = 'Field';
