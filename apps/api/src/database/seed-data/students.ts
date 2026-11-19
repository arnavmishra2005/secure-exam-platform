/**
 * The college's student list. Staff can't create students in the app: every
 * student account comes from here, with the email and password the student
 * signs in with, and instructors then enrol students in their courses
 * (searching by email or college ID). The dev seed uses DEMO_STUDENTS below;
 * `npm run db:seed-students` loads them, or a JSON file of the real list.
 */

import * as bcrypt from 'bcrypt';

export interface SeedStudent {
  collegeId: string;
  fullName: string;
  email: string;
  password: string;
}

/** Password of every development student. */
export const DEMO_STUDENT_PASSWORD = 'Student@1234';

/**
 * Enrolled in the sample courses by the dev seed (they own the sample exam's
 * attempts). Everyone else in DEMO_STUDENTS is on the college list but in no
 * course, so instructors can try enrolling them.
 */
export const ENROLLED_DEMO_STUDENTS: SeedStudent[] = [
  { collegeId: 'CS2024001', fullName: 'Alice Johnson', email: 'alice@secure-exam.dev', password: DEMO_STUDENT_PASSWORD },
  { collegeId: 'CS2024002', fullName: 'Bob Smith', email: 'bob@secure-exam.dev', password: DEMO_STUDENT_PASSWORD },
  { collegeId: 'CS2024003', fullName: 'Carol Williams', email: 'carol@secure-exam.dev', password: DEMO_STUDENT_PASSWORD },
];

/** [college ID prefix, names]: three departments of a demo college. */
const DEPARTMENTS: [string, string[]][] = [
  [
    'CS2024',
    [
      'Aarav Sharma', 'Diya Patel', 'Vihaan Gupta', 'Ananya Reddy', 'Arjun Nair', 'Isha Verma', 'Kabir Singh',
      'Meera Joshi', 'Rohan Mehta', 'Saanvi Kulkarni', 'Aditya Rao', 'Priya Menon', 'Karan Malhotra', 'Neha Iyer',
      'Rahul Desai', 'Sneha Pillai', 'Vikram Choudhary',
    ],
  ],
  [
    'EC2024',
    ['Aditi Banerjee', 'Dev Kapoor', 'Kavya Shetty', 'Nikhil Agarwal', 'Pooja Bhat', 'Siddharth Jain', 'Tanvi Saxena', 'Yash Thakur', 'Zara Khan', 'Manav Ghosh'],
  ],
  [
    'ME2024',
    ['Aryan Mishra', 'Bhavna Dutta', 'Chirag Pandey', 'Esha Chatterjee', 'Gaurav Sinha', 'Hina Qureshi', 'Ishaan Bose', 'Jiya Mathur', 'Laksh Tiwari', 'Riya Kaur'],
  ],
];

function demoEmail(fullName: string): string {
  return `${fullName.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')}@secure-exam.dev`;
}

/** The demo college: the three enrolled students and 37 more (CS, EC and ME). */
export const DEMO_STUDENTS: SeedStudent[] = [
  ...ENROLLED_DEMO_STUDENTS,
  ...DEPARTMENTS.flatMap(([prefix, names]) =>
    names.map((fullName, i) => {
      // CS numbers continue after the three enrolled students.
      const number = (prefix === 'CS2024' ? i + 4 : i + 1).toString().padStart(3, '0');
      return { collegeId: `${prefix}${number}`, fullName, email: demoEmail(fullName), password: DEMO_STUDENT_PASSWORD };
    }),
  ),
];

const BCRYPT_ROUNDS = 10;

interface Sql {
  // TypeORM's own query() returns Promise<any>; callers type each result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, parameters?: unknown[]): Promise<any>;
}

export interface UpsertedStudent {
  collegeId: string;
  email: string;
  /** students.id (null when skipped). */
  studentId: string | null;
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
}

/**
 * Creates the students that don't exist yet (a users row with role student and
 * its students row). An existing student keeps their password unless
 * `resetPasswords` (the dev seed resets them so the printed credentials always
 * work). An email that belongs to staff, or a college ID that belongs to
 * another account, is skipped: nothing is changed for it.
 */
export async function upsertStudents(
  sql: Sql,
  students: SeedStudent[],
  options: { resetPasswords?: boolean } = {},
): Promise<UpsertedStudent[]> {
  const results: UpsertedStudent[] = [];
  for (const student of students) {
    validate(student);
    const email = student.email.trim();
    const collegeId = student.collegeId.trim();
    const base = { collegeId, email };

    const [user]: { id: string; role: string }[] = await sql.query(
      `SELECT "id", "role" FROM "users" WHERE LOWER("email") = LOWER($1) LIMIT 1`,
      [email],
    );
    const [byCollegeId]: { id: string; userId: string }[] = await sql.query(
      `SELECT "id", "userId" FROM "students" WHERE "collegeId" = $1 LIMIT 1`,
      [collegeId],
    );

    if (user && user.role !== 'student') {
      results.push({ ...base, studentId: null, status: 'skipped', reason: `the email belongs to a ${user.role} account` });
      continue;
    }
    if (byCollegeId && byCollegeId.userId !== user?.id) {
      results.push({ ...base, studentId: null, status: 'skipped', reason: 'the college ID belongs to another student' });
      continue;
    }

    if (!user) {
      const [created]: { id: string }[] = await sql.query(
        `INSERT INTO "users" ("email", "fullName", "passwordHash", "role", "isActive")
         VALUES ($1, $2, $3, 'student', true) RETURNING "id"`,
        [email, student.fullName.trim(), await bcrypt.hash(student.password, BCRYPT_ROUNDS)],
      );
      const [row]: { id: string }[] = await sql.query(
        `INSERT INTO "students" ("userId", "collegeId") VALUES ($1, $2) RETURNING "id"`,
        [created.id, collegeId],
      );
      results.push({ ...base, studentId: row.id, status: 'created' });
      continue;
    }

    // An existing student account. It may lack its students row (made before the college list).
    let studentId = byCollegeId?.id;
    if (!studentId) {
      const [own]: { id: string; collegeId: string }[] = await sql.query(
        `SELECT "id", "collegeId" FROM "students" WHERE "userId" = $1 LIMIT 1`,
        [user.id],
      );
      if (own) {
        results.push({ ...base, studentId: own.id, status: 'skipped', reason: `the account already has college ID ${own.collegeId}` });
        continue;
      }
      const [row]: { id: string }[] = await sql.query(
        `INSERT INTO "students" ("userId", "collegeId") VALUES ($1, $2) RETURNING "id"`,
        [user.id, collegeId],
      );
      studentId = row.id;
    }
    if (options.resetPasswords) {
      await sql.query(`UPDATE "users" SET "passwordHash" = $1, "isActive" = true WHERE "id" = $2`, [
        await bcrypt.hash(student.password, BCRYPT_ROUNDS),
        user.id,
      ]);
    }
    results.push({ ...base, studentId, status: options.resetPasswords ? 'updated' : 'unchanged' });
  }
  return results;
}

function validate(student: SeedStudent): void {
  const label = student?.collegeId || student?.email || JSON.stringify(student);
  if (!student?.collegeId?.trim()) throw new Error(`${label}: collegeId is required`);
  if (student.collegeId.trim().length > 100) throw new Error(`${label}: collegeId is longer than 100 characters`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email ?? '')) throw new Error(`${label}: not an email address: ${student.email}`);
  if (!student.fullName?.trim()) throw new Error(`${label}: fullName is required`);
  if ((student.password ?? '').length < 8) throw new Error(`${label}: the password must be at least 8 characters`);
}
