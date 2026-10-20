/**
 * Owner: Person B. Small components styled with the host app's theme tokens
 * (bg-card, text-foreground, bg-primary, ...), so they match Person A's UI kit
 * in apps/web without importing from it. The playground defines the same tokens.
 * Feature code imports only from this file.
 */
import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50',
  secondary: 'border border-border bg-card text-foreground hover:bg-muted disabled:text-muted-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50',
  ghost: 'text-foreground hover:bg-muted disabled:text-muted-foreground',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; busy?: boolean }
>(function Button({ variant = 'secondary', size = 'md', busy, className, children, disabled, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-2 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});

/** Full width unless the caller sets a width class (w-*). */
const width = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full');

const CONTROL =
  'block rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring ' +
  'disabled:bg-muted disabled:text-muted-foreground';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(CONTROL, width(className), className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(CONTROL, width(className), 'font-mono', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(CONTROL, width(className), 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/** Label + control + hint/error. `children` receives the generated id. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground',
  green: 'bg-accent text-accent-foreground',
  amber: 'bg-gold-light text-foreground',
  red: 'bg-brick-light text-destructive',
  blue: 'bg-muted text-foreground',
  violet: 'bg-muted text-foreground',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', TONES[tone])}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'green' | 'blue'; children: ReactNode }) {
  const styles = {
    red: 'border-destructive bg-brick-light text-destructive',
    amber: 'border-warning bg-gold-light text-foreground',
    green: 'border-success bg-accent text-accent-foreground',
    blue: 'border-border bg-muted text-foreground',
  }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cx('rounded-md border px-3 py-2 text-sm', styles)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Simple modal. Closes on Escape and backdrop click. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('flex max-h-[90vh] w-full flex-col rounded-lg bg-card shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
