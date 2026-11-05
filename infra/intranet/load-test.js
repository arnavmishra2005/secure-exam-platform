// k6 run -e BASE_URL=https://exam.college.local/api -e STUDENTS=300 -e DATA_FILE=./attempts.json load-test.js
// Rehearsal data: [{ token, attemptId, questionId, optionId, codingQuestionId? }]. Never use real exam attempts.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
const students = new SharedArray('students', () => JSON.parse(open(__ENV.DATA_FILE)));
export const options = { vus: Number(__ENV.STUDENTS || students.length), duration: '2m', thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1500'] } };
export default function () {
  const s = students[(__VU - 1) % students.length];
  const params = { headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'X-Client-Type': 'DESKTOP' } };
  const base = `${__ENV.BASE_URL}/attempts/${s.attemptId}`;
  check(http.post(`${base}/heartbeat`, '{}', params), { 'heartbeat accepted': r => r.status === 200 || r.status === 201 });
  check(http.put(`${base}/answers/${s.questionId}`, JSON.stringify({ selectedOptionIds: [s.optionId] }), params), { 'answer accepted': r => r.status === 200 });
  if (__ENV.TEST_CODE_RUN === 'true' && s.codingQuestionId) check(http.post(`${base}/code/run`, JSON.stringify({ questionId: s.codingQuestionId, language: 'python', code: 'print(input())', kind: 'CUSTOM', stdin: 'hello' }), params), { 'code run accepted': r => r.status === 200 });
  sleep(15);
}
