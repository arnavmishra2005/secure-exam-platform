import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SplitPane } from '../ui/SplitPane';

const setup = (props: Partial<Parameters<typeof SplitPane>[0]> = {}) =>
  render(<SplitPane first={<p>left</p>} second={<p>right</p>} storageKey="test:split" {...props} />);
const handle = () => screen.getByRole('separator');

describe('SplitPane', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders both panes and starts at the default ratio', () => {
    setup({ defaultRatio: 40 });
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('right')).toBeTruthy();
    expect(handle().getAttribute('aria-valuenow')).toBe('40');
  });

  it('resizes with the arrow keys and stays within the limits', () => {
    setup({ defaultRatio: 40, minRatio: 30, maxRatio: 50 });
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(handle().getAttribute('aria-valuenow')).toBe('42');
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(handle().getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(handle().getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(handle().getAttribute('aria-valuenow')).toBe('30');
  });

  it('uses up/down keys when stacked', () => {
    setup({ direction: 'vertical', defaultRatio: 60 });
    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    expect(handle().getAttribute('aria-valuenow')).toBe('58');
    expect(handle().getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('resets on double-click and remembers the size', () => {
    const { unmount } = setup({ defaultRatio: 40 });
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(window.localStorage.getItem('test:split')).toBe('42');
    unmount();

    setup({ defaultRatio: 40 });
    expect(handle().getAttribute('aria-valuenow')).toBe('42');
    fireEvent.doubleClick(handle());
    expect(handle().getAttribute('aria-valuenow')).toBe('40');
  });

  it('ignores a corrupt stored value', () => {
    window.localStorage.setItem('test:split', 'banana');
    setup({ defaultRatio: 35 });
    expect(handle().getAttribute('aria-valuenow')).toBe('35');
  });
});
