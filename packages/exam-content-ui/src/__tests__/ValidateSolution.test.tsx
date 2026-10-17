import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ValidateSolution } from '../coding/authoring/ValidateSolution';
import { createFakeApi } from '../testing/fakeApi';
import { renderWithApi } from './render';

const coding = (referenceSolution: string) => ({
  statementMd: 'Square',
  referenceSolution,
  tests: [
    { input: '2', expectedOutput: '4', isSample: true },
    { input: '3', expectedOutput: '9', isSample: false },
  ],
});

describe('ValidateSolution', () => {
  it('is disabled until there is a reference solution', () => {
    renderWithApi(<ValidateSolution coding={coding('')} />, createFakeApi());
    expect((screen.getByRole('button', { name: 'Test reference solution' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the unsaved problem and reports success', async () => {
    const api = createFakeApi();
    const spy = vi.spyOn(api, 'validateCodingProblem');
    const c = coding('print(int(input())**2)');
    renderWithApi(<ValidateSolution coding={c} />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Test reference solution' }));
    expect(await screen.findByText('All 2 tests pass with the reference solution.')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith({ coding: c });
  });

  it('shows expected vs printed output for failing tests', async () => {
    renderWithApi(<ValidateSolution coding={coding('bug')} />, createFakeApi());
    fireEvent.click(screen.getByRole('button', { name: 'Test reference solution' }));
    expect(await screen.findByText(/1 of 2 tests fail/)).toBeTruthy();
    expect(screen.getByText('Reference solution printed')).toBeTruthy();
    expect(screen.getByText(/something else/)).toBeTruthy();
  });
});
