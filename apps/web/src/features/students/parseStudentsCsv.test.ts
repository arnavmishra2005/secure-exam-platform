import { describe, expect, it } from 'vitest';
import { parseStudentsCsv } from './parseStudentsCsv';

describe('parseStudentsCsv', () => {
  it('reads columns by header name, in any order, with an optional password', () => {
    const rows = parseStudentsCsv('email,collegeId,fullName,password\na@x.edu,CS1,Ada Lovelace,Secret123\nb@x.edu,CS2,Alan Turing,\n');
    expect(rows).toEqual([
      { collegeId: 'CS1', fullName: 'Ada Lovelace', email: 'a@x.edu', password: 'Secret123' },
      { collegeId: 'CS2', fullName: 'Alan Turing', email: 'b@x.edu' },
    ]);
  });

  it('keeps commas inside quoted names', () => {
    const [row] = parseStudentsCsv('collegeId,fullName,email\nCS3,"Hopper, Grace",g@x.edu');
    expect(row.fullName).toBe('Hopper, Grace');
  });

  it('rejects a file without the required columns or with an incomplete row', () => {
    expect(() => parseStudentsCsv('id,name\n1,x')).toThrow(/header/);
    expect(() => parseStudentsCsv('collegeId,fullName,email\nCS4,,d@x.edu')).toThrow(/Row 2/);
  });
});
