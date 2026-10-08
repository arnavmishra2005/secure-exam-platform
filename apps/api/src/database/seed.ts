/**
 * Dev Seed Script — creates an admin user, 3 test students, and an active evaluation exam.
 *
 * Run once after migrations:
 *   npm run db:seed --workspace=apps/api
 *
 * Idempotent: skips rows that already exist.
 * NEVER run in production — this is a development-only convenience tool.
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as bcrypt from 'bcrypt';
import cliDataSource from './data-source';

// ── Seed data ──────────────────────────────────────────────────────────────

const ADMIN = {
  email: 'admin@secure-exam.dev',
  fullName: 'Admin User',
  password: 'Admin@1234',
  role: 'admin' as const,
};

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

const BCRYPT_ROUNDS = 10;

// ── DB setup ───────────────────────────────────────────────────────────────

// Outside production the API runs with synchronize: true (app.module.ts), and
// the entities don't exactly match the migrations. Sync the schema the same way
// before inserting: once exam_assignments has rows, synchronize can no longer
// rebuild its student_id column, and the API would then fail to start.
const ds = new DataSource({
  ...(cliDataSource.options as PostgresConnectionOptions),
  url: process.env.DATABASE_URL ?? 'postgres://exam_user:exam_pass@localhost:5432/secure_exam',
  migrations: [],
  synchronize: process.env.NODE_ENV !== 'production',
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function upsertUser(
  ds: DataSource,
  email: string,
  fullName: string,
  password: string,
  role: 'admin' | 'student',
): Promise<{ id: string; created: boolean }> {
  const existing = await ds.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );

  if (existing.length > 0) {
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
): Promise<{ created: boolean }> {
  const existing = await ds.query<{ id: string }[]>(
    `SELECT id FROM students WHERE "collegeId" = $1 LIMIT 1`,
    [collegeId],
  );

  if (existing.length > 0) {
    return { created: false };
  }

  await ds.query(
    `INSERT INTO students ("userId", "collegeId") VALUES ($1, $2)`,
    [userId, collegeId],
  );

  return { created: true };
}

async function seedActiveExam(ds: DataSource, studentUserIds: string[]) {
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
      `INSERT INTO exams ("id", "title", "description", "duration_minutes", "start_time", "end_time", "status")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        SAMPLE_EXAM_ID,
        'Midterm Evaluation - OS & Networking',
        'Midterm examination covering CPU scheduling, memory management, and Transport layer protocols.',
        60,
        startTime,
        endTime,
        'ACTIVE',
      ],
    );
    console.log(`   ✅ Created active exam: ${SAMPLE_EXAM_ID}`);
  } else {
    // Keep it active and within time window
    await ds.query(
      `UPDATE exams SET "status" = 'ACTIVE', "start_time" = $1, "end_time" = $2 WHERE id = $3`,
      [startTime, endTime, SAMPLE_EXAM_ID],
    );
    console.log(`   ✅ Refreshed active exam: ${SAMPLE_EXAM_ID}`);
  }

  // Assign students to this exam
  for (const uid of studentUserIds) {
    await ds.query(
      `INSERT INTO exam_assignments ("exam_id", "student_id")
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [SAMPLE_EXAM_ID, uid],
    );
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
      `INSERT INTO questions ("text", "type", "marks", "negative_marks")
       VALUES ('Which scheduling algorithm can lead to starvation if lower priority processes arrive continuously?', 'MCQ_SINGLE', 2.0, 0.5)
       RETURNING id`,
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
      `INSERT INTO questions ("text", "type", "marks", "negative_marks")
       VALUES ('Select all protocols that operate at the Transport Layer of the OSI model:', 'MCQ_MULTI', 3.0, 1.0)
       RETURNING id`,
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
      `INSERT INTO questions ("text", "type", "marks", "negative_marks")
       VALUES ('A deadlock can occur even if the mutual exclusion condition is not satisfied.', 'TRUE_FALSE', 1.0, 0.25)
       RETURNING id`,
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
      `INSERT INTO questions ("text", "type", "marks", "negative_marks")
       VALUES ('What is the primary purpose of virtual memory in modern operating systems?', 'MCQ_SINGLE', 2.0, 0.5)
       RETURNING id`,
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
      `INSERT INTO questions ("text", "type", "marks", "negative_marks")
       VALUES ('Which of the following are valid private network IP address ranges (RFC 1918)?', 'MCQ_MULTI', 3.0, 0.5)
       RETURNING id`,
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

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🔌 Connecting to database…');
  await ds.initialize();
  console.log('✅ Connected\n');

  // ── Admin ──────────────────────────────────────────────────────────────
  console.log('👤 Seeding admin…');
  const adminResult = await upsertUser(ds, ADMIN.email, ADMIN.fullName, ADMIN.password, 'admin');
  if (adminResult.created) {
    console.log(`   ✅ Created admin: ${ADMIN.email} / ${ADMIN.password}`);
  } else {
    console.log(`   ⏭  Admin already exists: ${ADMIN.email}`);
  }

  // ── Students ───────────────────────────────────────────────────────────
  console.log('\n🎓 Seeding students…');
  const studentUserIds: string[] = [];

  for (const s of STUDENTS) {
    const userResult = await upsertUser(ds, s.email, s.fullName, s.password, 'student');
    studentUserIds.push(userResult.id);
    const studentResult = await upsertStudent(ds, userResult.id, s.collegeId);

    if (userResult.created || studentResult.created) {
      console.log(`   ✅ Created  ${s.fullName.padEnd(20)} | ${s.email.padEnd(28)} | password: ${s.password} | collegeId: ${s.collegeId}`);
    } else {
      console.log(`   ⏭  Exists   ${s.fullName.padEnd(20)} | ${s.email}`);
    }
  }

  // ── Active Exam ────────────────────────────────────────────────────────
  await seedActiveExam(ds, studentUserIds);

  console.log('\n──────────────────────────────────────────────────────');
  console.log('📋 Credentials & Exam Summary:');
  console.log('');
  console.log('  Admin Portal (http://localhost:3001)');
  console.log(`    Email:    ${ADMIN.email}`);
  console.log(`    Password: ${ADMIN.password}`);
  console.log('');
  console.log('  Exam Client (http://localhost:3002)');
  for (const s of STUDENTS) {
    console.log(`    ${s.fullName.padEnd(18)} → ${s.email} / ${s.password}`);
  }
  console.log('');
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
