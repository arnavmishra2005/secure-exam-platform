import { Role } from '@secure-exam/types';
import { assertAttemptSession } from './attempt-session';
describe('attempt device binding', () => {
  const attempt = { examId: 'exam', activeSessionId: 'current' } as never;
  it('allows the active student device', () => {
    expect(() => assertAttemptSession(attempt, { sub: 'student', role: Role.STUDENT, examId: 'exam', examSessionId: 'current' } as never)).not.toThrow();
  });
  it.each(['old', undefined])('locks a displaced or unbound device (%s)', examSessionId => {
    try {
      assertAttemptSession(attempt, { sub: 'student', role: Role.STUDENT, examSessionId } as never);
      throw new Error('Expected SESSION_MOVED');
    } catch (error) { expect(error).toMatchObject({ response: { code: 'SESSION_MOVED' } }); }
  });
  it('does not allow a session for another exam', () => {
    expect(() => assertAttemptSession(attempt, { role: Role.STUDENT, examId: 'other', examSessionId: 'current' } as never)).toThrow();
  });
});
