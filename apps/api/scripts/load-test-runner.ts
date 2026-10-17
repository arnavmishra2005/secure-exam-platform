/**
 * Owner: Person B. Load test for the code runner, through the real API.
 *
 * LOCAL / SCRATCH ENVIRONMENTS ONLY: it creates students and signs access
 * tokens with JWT_ACCESS_SECRET from apps/api/.env (login is limited to
 * 5/min per IP, so 100 students can't log in from one machine).
 *
 *   cd apps/api
 *   EXAM_ID=<active exam with the coding question> QUESTION_ID=<coding question> \
 *   STUDENTS=100 npx ts-node scripts/load-test-runner.ts
 *
 * Env: API_URL (default http://localhost:3000), STUDENTS (100), MODE (submit|run|both, default both),
 * ADMIN_EMAIL / ADMIN_PASSWORD (default: seed admin), CODE (default `print(int(input()) ** 2)`, which
 * solves the "square a number" question from docs/execution-security.md; pass your own otherwise).
 */
import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

const API = process.env.API_URL ?? 'http://localhost:3000';
const N = Number(process.env.STUDENTS ?? 100);
const MODE = process.env.MODE ?? 'both';
const EXAM_ID = required('EXAM_ID');
const QUESTION_ID = required('QUESTION_ID');
const CODE = process.env.CODE ?? 'print(int(input()) ** 2)';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Set ${name}`);
    process.exit(1);
  }
  return v;
}

async function http<T>(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: T; ms: number }> {
  const t = performance.now();
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T, ms: performance.now() - t };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

function summarize(label: string, results: { status: number; ms: number }[], wallMs: number) {
  const byStatus: Record<number, number> = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const ok = results.filter((r) => r.status === 200).map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n== ${label}: ${results.length} requests at once ==`);
  console.log(`status counts      ${JSON.stringify(byStatus)}`);
  console.log(`latency (200s) ms  p50 ${pct(ok, 50)} · p90 ${pct(ok, 90)} · p99 ${pct(ok, 99)} · max ${pct(ok, 100)}`);
  console.log(`all done after     ${Math.round(wallMs)} ms  (${(results.length / (wallMs / 1000)).toFixed(1)} req/s)`);
}

/** Times a cheap admin request every 250 ms while `work` runs: is the API still responsive? */
async function withProbe<T>(adminToken: string, work: () => Promise<T>): Promise<T> {
  const samples: number[] = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      const r = await http('GET', `/exams/${EXAM_ID}`, adminToken);
      samples.push(r.ms);
      await new Promise((res) => setTimeout(res, 250));
    }
  })();
  try {
    return await work();
  } finally {
    running = false;
    await loop;
    const s = [...samples].sort((a, b) => a - b);
    console.log(`API probe (GET /exams/:id during load) ms  p50 ${pct(s, 50)} · max ${pct(s, 100)} · n=${s.length}`);
  }
}

async function main() {
  const secret = required('JWT_ACCESS_SECRET');
  const jwt = new JwtService({ secret });

  const login = await http<{ accessToken: string }>('POST', '/auth/login', undefined, {
    email: process.env.ADMIN_EMAIL ?? 'admin@secure-exam.dev',
    password: process.env.ADMIN_PASSWORD ?? 'Admin@1234',
  });
  if (login.status !== 201 && login.status !== 200) throw new Error(`Admin login failed: ${login.status}`);
  const admin = login.data.accessToken;

  const run = randomUUID().slice(0, 8);
  console.log(`Creating ${N} students (run ${run})…`);
  const students: { token: string; attemptId: string }[] = [];
  for (let i = 0; i < N; i++) {
    const created = await http<{ userId: string; email: string }>('POST', '/students', admin, {
      collegeId: `LOAD-${run}-${i}`,
      fullName: `Load ${run} ${i}`,
      email: `load-${run}-${i}@load.test`,
      password: 'LoadTest@1234',
    });
    if (created.status !== 201) throw new Error(`Create student failed: ${created.status} ${JSON.stringify(created.data)}`);
    // Exams with assignments only admit assigned students (no-op for open exams).
    const assigned = await http('POST', `/exams/${EXAM_ID}/students`, admin, { studentId: created.data.userId });
    if (assigned.status >= 300 && assigned.status !== 409) {
      throw new Error(`Assign student failed: ${assigned.status} ${JSON.stringify(assigned.data)}`);
    }
    const token = jwt.sign({ sub: created.data.userId, email: created.data.email, role: 'student' }, { expiresIn: '30m' });
    const attempt = await http<{ id: string }>('POST', '/attempts', token, { examId: EXAM_ID });
    if (attempt.status !== 201) throw new Error(`Start attempt failed: ${attempt.status} ${JSON.stringify(attempt.data)}`);
    students.push({ token, attemptId: attempt.data.id });
  }

  if (MODE === 'run' || MODE === 'both') {
    const t = performance.now();
    const results = await withProbe(admin, () =>
      Promise.all(
        students.map((s) =>
          http('POST', `/attempts/${s.attemptId}/code/run`, s.token, {
            questionId: QUESTION_ID,
            language: 'python',
            kind: 'SAMPLES',
            code: CODE,
          }),
        ),
      ),
    );
    summarize('Run samples', results, performance.now() - t);
  }

  if (MODE === 'submit' || MODE === 'both') {
    const t = performance.now();
    const results = await withProbe(admin, () =>
      Promise.all(
        students.map((s) =>
          http<{ passed: number; total: number }>('POST', `/attempts/${s.attemptId}/code/submit`, s.token, {
            questionId: QUESTION_ID,
            language: 'python',
            code: CODE,
          }),
        ),
      ),
    );
    summarize('Submit (all tests)', results, performance.now() - t);
    const graded = results.filter((r) => r.status === 200);
    const allPassed = graded.filter((r) => r.data.passed === r.data.total).length;
    console.log(`correct verdicts   ${allPassed}/${graded.length} graded submissions passed every test`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
