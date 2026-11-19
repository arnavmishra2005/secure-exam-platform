import { DEMO_STUDENTS, ENROLLED_DEMO_STUDENTS, upsertStudents, type SeedStudent } from './students';

/** A tiny in-memory stand-in for the users and students tables, answering the queries upsertStudents sends. */
function fakeDb(users: { id: string; email: string; role: string }[] = [], students: { id: string; userId: string; collegeId: string }[] = []) {
  let next = 0;
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM "users"')) return users.filter((u) => u.email.toLowerCase() === String(params[0]).toLowerCase());
    if (sql.includes('FROM "students" WHERE "collegeId"')) return students.filter((s) => s.collegeId === params[0]);
    if (sql.includes('FROM "students" WHERE "userId"')) return students.filter((s) => s.userId === params[0]);
    if (sql.includes('INSERT INTO "users"')) {
      const row = { id: `u${++next}`, email: String(params[0]), role: 'student' };
      users.push(row);
      return [row];
    }
    if (sql.includes('INSERT INTO "students"')) {
      const row = { id: `s${++next}`, userId: String(params[0]), collegeId: String(params[1]) };
      students.push(row);
      return [row];
    }
    return [];
  });
  return { query, users, students };
}

const student = (collegeId: string, email: string): SeedStudent => ({ collegeId, email, fullName: 'Test Student', password: 'Student@1234' });

describe('the demo college student list', () => {
  it('has unique college IDs and emails, and starts with the enrolled students', () => {
    expect(new Set(DEMO_STUDENTS.map((s) => s.collegeId)).size).toBe(DEMO_STUDENTS.length);
    expect(new Set(DEMO_STUDENTS.map((s) => s.email.toLowerCase())).size).toBe(DEMO_STUDENTS.length);
    expect(DEMO_STUDENTS.slice(0, ENROLLED_DEMO_STUDENTS.length)).toEqual(ENROLLED_DEMO_STUDENTS);
    expect(DEMO_STUDENTS.length).toBeGreaterThanOrEqual(40);
    for (const s of DEMO_STUDENTS) expect(s.email).toMatch(/^[a-z.]+@secure-exam\.dev$/);
  });
});

describe('upsertStudents', () => {
  it('creates the account and its student row', async () => {
    const db = fakeDb();
    const [r] = await upsertStudents(db, [student('CS1', 'a@x.edu')]);
    expect(r).toMatchObject({ status: 'created', collegeId: 'CS1' });
    expect(db.students).toEqual([expect.objectContaining({ collegeId: 'CS1' })]);
  });

  it('leaves an existing student alone unless asked to reset passwords', async () => {
    const db = fakeDb([{ id: 'u1', email: 'a@x.edu', role: 'student' }], [{ id: 's1', userId: 'u1', collegeId: 'CS1' }]);
    expect((await upsertStudents(db, [student('CS1', 'A@x.edu')]))[0]).toMatchObject({ status: 'unchanged', studentId: 's1' });
    expect((await upsertStudents(db, [student('CS1', 'a@x.edu')], { resetPasswords: true }))[0].status).toBe('updated');
  });

  it('skips an email that belongs to staff and a college ID that belongs to someone else', async () => {
    const db = fakeDb(
      [{ id: 'u1', email: 'prof@x.edu', role: 'instructor' }, { id: 'u2', email: 'b@x.edu', role: 'student' }],
      [{ id: 's2', userId: 'u2', collegeId: 'CS2' }],
    );
    const [staff, taken] = await upsertStudents(db, [student('CS9', 'prof@x.edu'), student('CS2', 'c@x.edu')]);
    expect(staff).toMatchObject({ status: 'skipped', studentId: null });
    expect(taken).toMatchObject({ status: 'skipped', reason: 'the college ID belongs to another student' });
    expect(db.users).toHaveLength(2);
  });

  it('rejects a row without a usable email or password', async () => {
    await expect(upsertStudents(fakeDb(), [{ ...student('CS1', 'nope'), password: 'Student@1234' }])).rejects.toThrow(/email/);
    await expect(upsertStudents(fakeDb(), [{ ...student('CS1', 'a@x.edu'), password: 'short' }])).rejects.toThrow(/8 characters/);
  });
});
