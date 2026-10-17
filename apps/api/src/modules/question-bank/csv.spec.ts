import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses plain rows with CRLF or LF and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
    const csv = 'text,opt\n"What is ""x"", really?","line1\nline2, still"\n';
    expect(parseCsv(csv)).toEqual([
      ['text', 'opt'],
      ['What is "x", really?', 'line1\nline2, still'],
    ]);
  });

  it('keeps empty cells and strips a BOM', () => {
    expect(parseCsv('\uFEFFa,,c\n,,\n1,,')).toEqual([['a', '', 'c'], ['1', '', '']]);
  });

  it('parses a last row without a trailing newline', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });
});
