// [SHARED — scaffold together Day 0]

'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-verdigris text-white hover:bg-verdigris-dark disabled:bg-verdigris/50',
  secondary:
    'bg-transparent text-ink border border-hairline hover:border-ink disabled:opacity-50',
  danger: 'bg-brick text-white hover:bg-brick/90 disabled:bg-brick/50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading, className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {isLoading ? 'Working…' : children}
      </button>
    );
  },
);
Button.displayName = 'Button';
