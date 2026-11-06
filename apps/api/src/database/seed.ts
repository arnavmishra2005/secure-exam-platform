/**
 * Dev Seed Script — creates instructors (there is no admin), a TA, 3 test
 * students, a course they are enrolled in, and an active, published exam
 * owned by that course. A second instructor gets their own course and draft
 * exam, so you can check that instructors only see their own courses.
 *
 * Run once after migrations:
 *   npm run db:seed --workspace=apps/api
 *
 * Idempotent: skips rows that already exist.
 * NEVER run in production — this is a development-only convenience tool.
 * (Production instructors: `npm run db:seed-instructors -- instructors.json`.)
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as bcrypt from 'bcrypt';
import cliDataSource from './data-source';
import {
  MERGE_INTERVALS_MARKS,
  MERGE_INTERVALS_REFERENCE,
  MERGE_INTERVALS_STARTER,
  MERGE_INTERVALS_STATEMENT,
  MERGE_INTERVALS_TEST_CASES,
  MERGE_INTERVALS_TITLE,
  SeedTestCase,
} from './seed-data/merge-intervals';
import {
  LAST_ELEMENT_MARKS,
  LAST_ELEMENT_REFERENCE,
  LAST_ELEMENT_STARTER,
  LAST_ELEMENT_STATEMENT,
  LAST_ELEMENT_TEST_CASES,
  LAST_ELEMENT_TITLE,
} from './seed-data/last-element';
import { EASY_CODING_QUESTIONS, EASY_CODING_TAGS, EASY_CODING_TOPIC } from './seed-data/easy-coding';
import { DEFAULT_INSTRUCTORS, upsertInstructors } from './seed-data/instructors';
import { backfillOwnership, convertAdminRoleToInstructor } from './phase5-ownership';

// ── Seed data ──────────────────────────────────────────────────────────────

/** Owns CS201 and the sample exam. */
const INSTRUCTOR = DEFAULT_INSTRUCTORS[0];
/** Owns CS301 and its draft exam; can't see CS201. */
const OTHER_INSTRUCTOR = DEFAULT_INSTRUCTORS[1];

/** A TA on CS201 with the default permissions (view exams, monitor, view results). */
const TA = {
  email: 'ta@secure-exam.dev',
  fullName: 'Tara Assistant',
  password: 'Assistant@1234',
  permissions: ['EXAM_VIEW', 'MONITOR', 'RESULTS_VIEW'],
};

/** The pre-Phase 5 development admin, deactivated by this seed if it exists. */
const LEGACY_ADMIN_EMAIL = 'admin@secure-exam.dev';

const STUDENTS = [
  {
    collegeId: 'CS2024001',
    fullName: 'Alice Johnson',
    email: 'alice@secure-exam.dev',
    password: 'Student@1234',
  },
  {
    collegeId: 'CS2024002',
    fullName: 'Bob Smith',
    email: 'bob@secure-exam.dev',
    password: 'Student@1234',
  },
  {
    collegeId: 'CS2024003',
    fullName: 'Carol Williams',
    email: 'carol@secure-exam.dev',
    password: 'Student@1234',
  },
];

// Must be a v4 UUID: StartAttemptDto rejects any other version.
const SAMPLE_EXAM_ID = '11111111-1111-4111-8111-111111111111';

const SAMPLE_COURSE = { code: 'CS201', name: 'Operating Systems & Networks' };

// The second instructor's course and draft exam.
const OTHER_COURSE = { code: 'CS301', name: 'Design & Analysis of Algorithms' };
const OTHER_EXAM_ID = '22222222-2222-4222-8222-222222222222';

const BCRYPT_ROUNDS = 10;

// ── DB setup ───────────────────────────────────────────────────────────────

// Outside production the API runs with synchronize: true (app.module.ts), and
// the entities don't exactly match the migrations. Sync the schema the same way
// before inserting, so the tables the seed writes to (including Phase 4's
// courses and exam_registrations) exist with the shape the API expects.
const connection = {
  ...(cliDataSource.options as PostgresConnectionOptions),
  url: process.env.DATABASE_URL ?? 'postgres://exam_user:exam_pass@localhost:5432/secure_exam',
  migrations: [],
};
const ds = new DataSource({ ...connection, synchronize: process.env.NODE_ENV !== 'production' });

/**
 * synchronize can't turn the old `admin` users into `instructor`s (it would
 * fail on the existing rows), so do that first, on a connection that doesn't
 * synchronize. Same SQL as the Phase 5 migration; a no-op once done.
 */
async function convertLegacyRoles() {
  const plain = new DataSource({ ...connection, synchronize: false });
  await plain.initialize();
  try {
    if (await convertAdminRoleToInstructor(plain)) console.log('🔁 Converted admin accounts to instructors\n');
  } finally {
    await plain.destroy();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function upsertUser(
  ds: DataSource,
  email: string,
  fullName: string,
  password: string,
  role: 'ta' | 'student',
): Promise<{ id: string; created: boolean }> {
  const existing = await ds.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );

  if (existing.length > 0) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await ds.query(
      `UPDATE users SET "passwordHash" = $1, "isActive" = true WHERE id = $2`,
      [passwordHash, existing[0].id],
    );
    return { id: existing[0].id, created: false };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [row] = await ds.query<{ id: string }[]>(
    `INSERT INTO users ("email", "fullName", "passwordHash", "role", "isActive")
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [email, fullName, passwordHash, role],
  );

  return { id: row.id, created: true };
}

async function upsertStudent(
  ds: DataSource,
  userId: string,
  collegeId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await ds.query<{ id: string }[]>(
    `SELECT id FROM students WHERE "collegeId" = $1 LIMIT 1`,
    [collegeId],
  );

  if (existing.length > 0) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await ds.query<{ id: string }[]>(
    `INSERT INTO students ("userId", "collegeId") VALUES ($1, $2) RETURNING id`,
    [userId, collegeId],
  );

  return { id: row.id, created: true };
}

/** A course taught by `instructorId` (plus optional TAs), with these students enrolled. */
async function seedCourse(
  ds: DataSource,
  course: { code: string; name: string },
  instructorId: string,
  studentIds: string[],
  tas: { userId: string; permissions: string[] }[] = [],
): Promise<string> {
  const [row] = await ds.query<{ id: string }[]>(
    `INSERT INTO courses ("code", "name") VALUES ($1, $2)
     ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name"
     RETURNING id`,
    [course.code, course.name],
  );
  await ds.query(
    `INSERT INTO course_staff ("courseId", "userId", "role", "permissions")
     VALUES ($1, $2, 'INSTRUCTOR', '[]'::jsonb)
     ON CONFLICT ("courseId", "userId") DO UPDATE SET "role" = 'INSTRUCTOR'`,
    [row.id, instructorId],
  );
  for (const ta of tas) {
    await ds.query(
      `INSERT INTO course_staff ("courseId", "userId", "role", "permissions", "addedBy")
       VALUES ($1, $2, 'TA', $3::jsonb, $4)
       ON CONFLICT ("courseId", "userId") DO NOTHING`,
      [row.id, ta.userId, JSON.stringify(ta.permissions), instructorId],
    );
  }
  for (const studentId of studentIds) {
    await ds.query(
      `INSERT INTO course_enrollments ("courseId", "studentId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [row.id, studentId],
    );
  }
  const staff = tas.length ? ` and ${tas.length} TA` : '';
  console.log(`   ✅ ${course.code}: 1 instructor${staff}, ${studentIds.length} students`);
  return row.id;
}

/** The exam belongs to the course, and every enrolled student is registered for it. */
async function assignExamToCourse(ds: DataSource, examId: string, courseId: string, studentIds: string[]) {
  await ds.query(`UPDATE exams SET "course_id" = $1 WHERE id = $2`, [courseId, examId]);
  await ds.query(
    `INSERT INTO exam_courses ("examId", "courseId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [examId, courseId],
  );
  for (const studentId of studentIds) {
    await ds.query(
      `INSERT INTO exam_registrations ("examId", "studentId", "source", "courseId")
       VALUES ($1, $2, 'COURSE', $3) ON CONFLICT DO NOTHING`,
      [examId, studentId, courseId],
    );
  }
}

/** The second instructor's draft exam: unpublished, so students don't see it. */
async function seedOtherInstructorExam(ds: DataSource, courseId: string) {
  const startTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  await ds.query(
    `INSERT INTO exams ("id", "title", "description", "duration_minutes", "start_time", "end_time", "status", "pass_percentage", "course_id")
     VALUES ($1, $2, $3, 45, $4, $5, 'DRAFT', 40, $6)
     ON CONFLICT ("id") DO UPDATE SET "course_id" = EXCLUDED."course_id"`,
    [OTHER_EXAM_ID, 'Algorithms Quiz 1', 'Greedy algorithms and divide and conquer.', startTime, endTime, courseId],
  );
  await ds.query(`INSERT INTO exam_courses ("examId", "courseId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    OTHER_EXAM_ID,
    courseId,
  ]);
  console.log(`   ✅ ${OTHER_COURSE.code}: draft exam "Algorithms Quiz 1"`);
}

async function seedActiveExam(ds: DataSource, courseId: string, ownerId: string) {
  console.log('\n📝 Seeding active exam…');

  const existingExam = await ds.query<{ id: string }[]>(
    `SELECT id FROM exams WHERE id = $1 LIMIT 1`,
    [SAMPLE_EXAM_ID],
  );

  const now = new Date();
  const startTime = new Date(now.getTime() - 30 * 60 * 1000); // started 30 mins ago
  const endTime = new Date(now.getTime() + 48 * 60 * 60 * 1000); // valid for next 48 hours

  if (existingExam.length === 0) {
    await ds.query(
      `INSERT INTO exams ("id", "title", "description", "duration_minutes", "start_time", "end_time", "status", "published_at", "pass_percentage", "course_id")
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), 40, $8)`,
      [
        SAMPLE_EXAM_ID,
        'Midterm Evaluation - OS & Networking',
        'Midterm examination covering CPU scheduling, memory management, and Transport layer protocols.',
        60,
        startTime,
        endTime,
        'ACTIVE',
        courseId,
      ],
    );
    console.log(`   ✅ Created active exam: ${SAMPLE_EXAM_ID}`);
  } else {
    // Keep it active and within time window (a fresh window, not a reschedule)
    await ds.query(
      `UPDATE exams SET "status" = 'ACTIVE', "start_time" = $1, "end_time" = $2,
              "published_at" = COALESCE("published_at", now()), "course_id" = $4,
              "original_start_time" = NULL, "schedule_note" = NULL WHERE id = $3`,
      [startTime, endTime, SAMPLE_EXAM_ID, courseId],
    );
    console.log(`   ✅ Refreshed active exam: ${SAMPLE_EXAM_ID}`);
  }

  // Seed sample questions if not present
  const existingQuestions = await ds.query<{ count: string }[]>(
    `SELECT count(*) as count FROM exam_questions WHERE exam_id = $1`,
    [SAMPLE_EXAM_ID],
  );

  if (parseInt(existingQuestions[0]?.count || '0', 10) === 0) {
    console.log('   📚 Adding questions to exam…');

    // Q1: MCQ Single
    const [q1] = await ds.query<{ id: string }[]>(
      `INSERT INTO questions ("text", "type", "marks", "negative_marks", "owner_id")
       VALUES ('Which scheduling algorithm can lead to starvation if lower priority processes arrive continuously?', 'MCQ_SINGLE', 2.0, 0.5, $1)
       RETURNING id`,
      [ownerId],
    );
    await ds.query(
      `INSERT INTO options ("question_id", "text", "is_correct", "order") VALUES
       ($1, 'Round Robin (RR)', false, 1),
       ($1, 'Priority Scheduling (non-preemptive)', true, 2),
       ($1, 'First-Come, First-Served (FCFS)', false, 3),
       ($1, 'Aging Scheduler', false, 4)`,
      [q1.id],
    );
    await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, 1)`, [
      SAMPLE_EXAM_ID,
      q1.id,
    ]);

    // Q2: MCQ Multi
    const [q2] = await ds.query<{ id: string }[]>(
      `INSERT INTO questions ("text", "type", "marks", "negative_marks", "owner_id")
       VALUES ('Select all protocols that operate at the Transport Layer of the OSI model:', 'MCQ_MULTI', 3.0, 1.0, $1)
       RETURNING id`,
      [ownerId],
    );
    await ds.query(
      `INSERT INTO options ("question_id", "text", "is_correct", "order") VALUES
       ($1, 'Transmission Control Protocol (TCP)', true, 1),
       ($1, 'User Datagram Protocol (UDP)', true, 2),
       ($1, 'Internet Protocol (IP)', false, 3),
       ($1, 'Address Resolution Protocol (ARP)', false, 4)`,
      [q2.id],
    );
    await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, 2)`, [
      SAMPLE_EXAM_ID,
      q2.id,
    ]);

    // Q3: True / False
    const [q3] = await ds.query<{ id: string }[]>(
      `INSERT INTO questions ("text", "type", "marks", "negative_marks", "owner_id")
       VALUES ('A deadlock can occur even if the mutual exclusion condition is not satisfied.', 'TRUE_FALSE', 1.0, 0.25, $1)
       RETURNING id`,
      [ownerId],
    );
    await ds.query(
      `INSERT INTO options ("question_id", "text", "is_correct", "order") VALUES
       ($1, 'True', false, 1),
       ($1, 'False', true, 2)`,
      [q3.id],
    );
    await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, 3)`, [
      SAMPLE_EXAM_ID,
      q3.id,
    ]);

    // Q4: MCQ Single
    const [q4] = await ds.query<{ id: string }[]>(
      `INSERT INTO questions ("text", "type", "marks", "negative_marks", "owner_id")
       VALUES ('What is the primary purpose of virtual memory in modern operating systems?', 'MCQ_SINGLE', 2.0, 0.5, $1)
       RETURNING id`,
      [ownerId],
    );
    await ds.query(
      `INSERT INTO options ("question_id", "text", "is_correct", "order") VALUES
       ($1, 'To allow processes to share the CPU cache efficiently', false, 1),
       ($1, 'To provide contiguous address space and allow execution larger than RAM', true, 2),
       ($1, 'To completely eliminate page faults during disk I/O', false, 3),
       ($1, 'To convert dynamic RAM into static RAM dynamically', false, 4)`,
      [q4.id],
    );
    await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, 4)`, [
      SAMPLE_EXAM_ID,
      q4.id,
    ]);

    // Q5: MCQ Multi
    const [q5] = await ds.query<{ id: string }[]>(
      `INSERT INTO questions ("text", "type", "marks", "negative_marks", "owner_id")
       VALUES ('Which of the following are valid private network IP address ranges (RFC 1918)?', 'MCQ_MULTI', 3.0, 0.5, $1)
       RETURNING id`,
      [ownerId],
    );
    await ds.query(
      `INSERT INTO options ("question_id", "text", "is_correct", "order") VALUES
       ($1, '10.0.0.0/8', true, 1),
       ($1, '172.16.0.0/12', true, 2),
       ($1, '8.8.8.8/32', false, 3),
       ($1, '192.168.0.0/16', true, 4)`,
      [q5.id],
    );
    await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, 5)`, [
      SAMPLE_EXAM_ID,
      q5.id,
    ]);

    console.log('   ✅ 5 questions linked to exam');
  }
}

interface SeedCodingProblem {
  title: string;
  marks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  statement: string;
  starter: string;
  reference: string;
  testCases: SeedTestCase[];
}

const CODING_PROBLEMS: SeedCodingProblem[] = [
  {
    title: LAST_ELEMENT_TITLE,
    marks: LAST_ELEMENT_MARKS,
    difficulty: 'EASY',
    statement: LAST_ELEMENT_STATEMENT,
    starter: LAST_ELEMENT_STARTER,
    reference: LAST_ELEMENT_REFERENCE,
    testCases: LAST_ELEMENT_TEST_CASES,
  },
  {
    title: MERGE_INTERVALS_TITLE,
    marks: MERGE_INTERVALS_MARKS,
    difficulty: 'MEDIUM',
    statement: MERGE_INTERVALS_STATEMENT,
    starter: MERGE_INTERVALS_STARTER,
    reference: MERGE_INTERVALS_REFERENCE,
    testCases: MERGE_INTERVALS_TEST_CASES,
  },
];

/**
 * The coding questions (an easy Last Element and a medium Merge Intervals) in the sample exam,
 * so the code editor, the runner and the grading can be tried. Separate from the MCQs above so
 * that they are also added to a database that already has them. Idempotent: a question is
 * skipped when the exam already has a coding question with its title.
 */
async function seedCodingQuestion(ds: DataSource, p: SeedCodingProblem, ownerId: string) {
  const existing = await ds.query<{ id: string }[]>(
    `SELECT q.id FROM questions q JOIN exam_questions eq ON eq."question_id" = q.id
      WHERE eq."exam_id" = $1 AND q."type" = 'CODING' AND q."text" = $2 LIMIT 1`,
    [SAMPLE_EXAM_ID, p.title],
  );
  if (existing.length > 0) {
    console.log(`   ⏭  "${p.title}" already in the sample exam`);
    return;
  }

  console.log(`   💻 Adding "${p.title}"…`);
  const [question] = await ds.query<{ id: string }[]>(
    `INSERT INTO questions ("text", "type", "marks", "negative_marks", "difficulty", "status", "owner_id")
     VALUES ($1, 'CODING', $2, 0, $3, 'READY', $4) RETURNING id`,
    [p.title, p.marks, p.difficulty, ownerId],
  );
  await ds.query(
    `INSERT INTO coding_problems
       ("question_id", "statement_md", "starter_code", "allowed_languages", "time_limit_ms", "memory_limit_mb", "comparison_mode", "reference_solution")
     VALUES ($1, $2, $3::jsonb, '{python}', 2000, 256, 'TRIM', $4)`,
    [question.id, p.statement, JSON.stringify({ python: p.starter }), p.reference],
  );
  let order = 0;
  for (const t of p.testCases) {
    await ds.query(
      `INSERT INTO coding_test_cases ("question_id", "input", "expected_output", "is_sample", "weight", "order")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [question.id, t.input, t.expectedOutput, t.isSample, t.weight, order++],
    );
  }
  const [{ next }] = await ds.query<{ next: number }[]>(
    `SELECT COALESCE(MAX("order"), 0) + 1 AS next FROM exam_questions WHERE "exam_id" = $1`,
    [SAMPLE_EXAM_ID],
  );
  await ds.query(`INSERT INTO exam_questions ("exam_id", "question_id", "order") VALUES ($1, $2, $3)`, [
    SAMPLE_EXAM_ID,
    question.id,
    next,
  ]);
  console.log(`   ✅ "${p.title}" (${p.marks} marks, ${p.testCases.length} test cases) added as question ${next}`);
}

/**
 * Easy coding questions in the instructor's question bank, not linked to any exam, so
 * they can add them to an exam from the bank. Idempotent: a question is skipped when a
 * coding question with the same title already exists.
 */
async function seedBankCodingQuestions(ds: DataSource, ownerId: string) {
  console.log('\n📚 Seeding easy coding questions into the question bank…');
  let [topic] = await ds.query<{ id: string }[]>(
    `SELECT id FROM topics WHERE "course_id" IS NULL AND "name" = $1 AND ("owner_id" = $2 OR "owner_id" IS NULL) LIMIT 1`,
    [EASY_CODING_TOPIC, ownerId],
  );
  if (!topic) {
    [topic] = await ds.query<{ id: string }[]>(`INSERT INTO topics ("name", "owner_id") VALUES ($1, $2) RETURNING id`, [
      EASY_CODING_TOPIC,
      ownerId,
    ]);
  } else {
    await ds.query(`UPDATE topics SET "owner_id" = $1 WHERE id = $2`, [ownerId, topic.id]);
  }

  for (const q of EASY_CODING_QUESTIONS) {
    const existing = await ds.query<{ id: string }[]>(
      `SELECT id FROM questions WHERE "text" = $1 AND "type" = 'CODING' LIMIT 1`,
      [q.title],
    );
    if (existing.length > 0) {
      console.log(`   ⏭  "${q.title}" already in the bank`);
      continue;
    }

    await ds.transaction(async (tx) => {
      const [question] = await tx.query<{ id: string }[]>(
        `INSERT INTO questions ("text", "type", "marks", "negative_marks", "difficulty", "status", "topic_id", "owner_id")
         VALUES ($1, 'CODING', $2, 0, 'EASY', 'READY', $3, $4) RETURNING id`,
        [q.title, q.marks, topic.id, ownerId],
      );
      await tx.query(
        `INSERT INTO coding_problems
           ("question_id", "statement_md", "starter_code", "allowed_languages", "time_limit_ms", "memory_limit_mb", "comparison_mode", "reference_solution")
         VALUES ($1, $2, $3::jsonb, '{python}', 2000, 256, 'TRIM', $4)`,
        [question.id, q.statement, JSON.stringify({ python: q.starter }), q.reference],
      );
      let order = 0;
      for (const t of q.testCases) {
        await tx.query(
          `INSERT INTO coding_test_cases ("question_id", "input", "expected_output", "is_sample", "weight", "order")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [question.id, t.input, t.expectedOutput, t.isSample, t.weight, order++],
        );
      }
      for (const tag of EASY_CODING_TAGS) {
        await tx.query(`INSERT INTO question_tags ("question_id", "tag") VALUES ($1, $2)`, [question.id, tag]);
      }
    });
    console.log(`   ✅ "${q.title}" (${q.marks} marks, ${q.testCases.length} test cases)`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🔌 Connecting to database…');
  await convertLegacyRoles();
  await ds.initialize();
  console.log('✅ Connected\n');

  // ── Instructors and a TA (there is no admin) ─────────────────────────────
  console.log('👩‍🏫 Seeding instructors…');
  const instructors = await upsertInstructors(ds, DEFAULT_INSTRUCTORS, { resetPasswords: true });
  for (const r of instructors) {
    console.log(`   ${r.status === 'created' ? '✅ Created' : r.status === 'skipped' ? '⚠️  Skipped' : '⏭  Exists '}  ${r.email}${r.reason ? ` (${r.reason})` : ''}`);
  }
  const instructorId = instructors.find((r) => r.email === INSTRUCTOR.email)!.id;
  const otherInstructorId = instructors.find((r) => r.email === OTHER_INSTRUCTOR.email)!.id;
  const ta = await upsertUser(ds, TA.email, TA.fullName, TA.password, 'ta');
  console.log(`   ${ta.created ? '✅ Created' : '⏭  Exists '}  ${TA.email} (TA)`);

  const legacyAdmin = await ds.query<{ id: string }[]>(
    `UPDATE users SET "isActive" = false WHERE email = $1 AND "isActive" = true RETURNING id`,
    [LEGACY_ADMIN_EMAIL],
  );
  if (legacyAdmin.length > 0) console.log(`   🚫 Deactivated the old ${LEGACY_ADMIN_EMAIL} account (there is no admin any more)`);

  // ── Students ───────────────────────────────────────────────────────────
  console.log('\n🎓 Seeding students…');
  const studentIds: string[] = [];

  for (const s of STUDENTS) {
    const userResult = await upsertUser(ds, s.email, s.fullName, s.password, 'student');
    const studentResult = await upsertStudent(ds, userResult.id, s.collegeId);
    studentIds.push(studentResult.id);

    if (userResult.created || studentResult.created) {
      console.log(`   ✅ Created  ${s.fullName.padEnd(20)} | ${s.email.padEnd(28)} | password: ${s.password} | collegeId: ${s.collegeId}`);
    } else {
      console.log(`   ⏭  Exists   ${s.fullName.padEnd(20)} | ${s.email}`);
    }
  }

  // ── Courses ────────────────────────────────────────────────────────────
  console.log('\n🏫 Seeding courses…');
  const courseId = await seedCourse(ds, SAMPLE_COURSE, instructorId, studentIds, [
    { userId: ta.id, permissions: TA.permissions },
  ]);
  const otherCourseId = await seedCourse(ds, OTHER_COURSE, otherInstructorId, studentIds);

  // ── Exams ──────────────────────────────────────────────────────────────
  await seedActiveExam(ds, courseId, instructorId);
  for (const problem of CODING_PROBLEMS) await seedCodingQuestion(ds, problem, instructorId);
  await seedBankCodingQuestions(ds, instructorId);
  await assignExamToCourse(ds, SAMPLE_EXAM_ID, courseId, studentIds);
  await seedOtherInstructorExam(ds, otherCourseId);

  // Rows from before Phase 5 (made by the old admin) go to the main instructor.
  await backfillOwnership(ds, INSTRUCTOR.email);

  console.log('\n──────────────────────────────────────────────────────');
  console.log('📋 Credentials & Exam Summary:');
  console.log('');
  console.log('  Web app — one login for everyone (http://localhost:3003)');
  console.log('  Instructors');
  console.log(`    ${INSTRUCTOR.fullName.padEnd(18)} → ${INSTRUCTOR.email} / ${INSTRUCTOR.password}   (${SAMPLE_COURSE.code}, the sample exam)`);
  console.log(`    ${OTHER_INSTRUCTOR.fullName.padEnd(18)} → ${OTHER_INSTRUCTOR.email} / ${OTHER_INSTRUCTOR.password}   (${OTHER_COURSE.code} only)`);
  console.log(`    ${DEFAULT_INSTRUCTORS[2].fullName.padEnd(18)} → ${DEFAULT_INSTRUCTORS[2].email} / ${DEFAULT_INSTRUCTORS[2].password}   (no courses yet)`);
  console.log('  Teaching assistant');
  console.log(`    ${TA.fullName.padEnd(18)} → ${TA.email} / ${TA.password}   (${SAMPLE_COURSE.code}: view exams, monitor, view results)`);
  console.log('');
  console.log('  Students (web app, or legacy exam client on http://localhost:3002)');
  for (const s of STUDENTS) {
    console.log(`    ${s.fullName.padEnd(18)} → ${s.email} / ${s.password}`);
  }
  console.log('');
  console.log('  The sample exam has 5 multiple-choice questions and 2 coding questions');
  console.log(`  (${CODING_PROBLEMS.map((p) => `${p.title}, ${p.marks} marks`).join('; ')}).`);
  console.log(
    `  ${INSTRUCTOR.fullName}'s question bank also has ${EASY_CODING_QUESTIONS.length} easy coding questions (topic "${EASY_CODING_TOPIC}", tag "sample") to add to new exams.`,
  );
  console.log('  Active Exam ID for Testing:');
  console.log(`    ${SAMPLE_EXAM_ID}`);
  console.log('──────────────────────────────────────────────────────\n');

  await ds.destroy();
  console.log('✅ Seed complete.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
