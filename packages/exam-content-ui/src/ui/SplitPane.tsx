/**
 * Owner: Person B. Two panes with a draggable divider, like the problem /
 * editor split on LeetCode-style sites.
 *
 * - Drag the divider, or focus it and use the arrow keys (Home / End jump to
 *   the limits, double-click or Enter resets).
 * - `collapseBelow`: under that viewport width (px) the panes simply stack and
 *   the divider is hidden, so phones and narrow windows keep a normal layout.
 * - The ratio is remembered per `storageKey` in localStorage (best effort).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from './index';

export interface SplitPaneProps {
  first: ReactNode;
  second: ReactNode;
  /** 'horizontal' = side by side (vertical divider); 'vertical' = stacked (horizontal divider). */
  direction?: 'horizontal' | 'vertical';
  /** Size of the first pane, in percent. */
  defaultRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  storageKey?: string;
  /** Below this viewport width (px) the panes stack without a divider. Horizontal only. */
  collapseBelow?: number;
  label?: string;
  className?: string;
}

const STEP = 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function readStored(key: string | undefined, min: number, max: number): number | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp(n, min, max) : null;
  } catch {
    return null;
  }
}

function useWide(minWidth: number): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const get = () => (typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(query).matches);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return wide;
}

export function SplitPane({
  first,
  second,
  direction = 'horizontal',
  defaultRatio = 40,
  minRatio = 20,
  maxRatio = 80,
  storageKey,
  collapseBelow = 0,
  label = 'Resize panels',
  className,
}: SplitPaneProps) {
  const horizontal = direction === 'horizontal';
  const wide = useWide(collapseBelow || 0);
  const split = !horizontal || wide;
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => readStored(storageKey, minRatio, maxRatio) ?? defaultRatio);
  const [dragging, setDragging] = useState(false);

  const update = useCallback(
    (next: number, persist: boolean) => {
      const value = clamp(next, minRatio, maxRatio);
      setRatio(value);
      if (persist && storageKey) {
        try {
          window.localStorage.setItem(storageKey, String(value));
        } catch {
          /* private mode: the layout just isn't remembered */
        }
      }
    },
    [minRatio, maxRatio, storageKey],
  );

  const fromPointer = (e: PointerEvent): number | null => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return null;
    const size = horizontal ? box.width : box.height;
    if (size <= 0) return null;
    const offset = horizontal ? e.clientX - box.left : e.clientY - box.top;
    return (offset / size) * 100;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = fromPointer(e);
    if (next !== null) update(next, false);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const next = fromPointer(e);
    update(next ?? ratio, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) update(ratio - STEP, true);
    else if (e.key === inc) update(ratio + STEP, true);
    else if (e.key === 'Home') update(minRatio, true);
    else if (e.key === 'End') update(maxRatio, true);
    else if (e.key === 'Enter') update(defaultRatio, true);
    else return;
    e.preventDefault();
  };

  if (!split) {
    return (
      <div className={cx('flex flex-col gap-4', className)}>
        <div className="min-w-0">{first}</div>
        <div className="min-w-0">{second}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cx('flex min-h-0 min-w-0', horizontal ? 'flex-row' : 'flex-col', dragging && 'select-none', className)}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: `0 0 ${ratio}%` }}>
        {first}
      </div>
      <div
        role="separator"
        aria-label={label}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={minRatio}
        aria-valuemax={maxRatio}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => update(defaultRatio, true)}
        onKeyDown={onKeyDown}
        className={cx(
          'group flex shrink-0 items-center justify-center focus:outline-none',
          horizontal ? 'w-3 cursor-col-resize' : 'h-3 cursor-row-resize',
          // wide invisible hit area on touch, thin visible line
          'touch-none',
        )}
      >
        <span
          className={cx(
            'rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary',
            dragging && 'bg-primary',
            horizontal ? 'h-10 w-1' : 'h-1 w-10',
          )}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
