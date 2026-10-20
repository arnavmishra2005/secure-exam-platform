// Owner: Person A — UI kit

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex gap-3 rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-primary/30 bg-accent text-accent-foreground',
      success: 'border-success/30 bg-success/10 text-success',
      warning: 'border-warning/40 bg-warning/10 text-[hsl(38_60%_28%)]',
      destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'info' },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, destructive: XCircle };

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? 'info'];
  return (
    <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
