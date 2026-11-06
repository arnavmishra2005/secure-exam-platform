import { ConfigService } from '@nestjs/config';
import { Role } from '@secure-exam/types';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
jest.mock('bcrypt', () => ({ hash: jest.fn(async text => `hash:${text}`), compare: jest.fn(async (text, hash) => `hash:${text}` === hash) }));

function setup() {
  const binding = { examSessionId: 'session', examId: 'exam' };
  const user = { id: 'student', email: 's@college.local', role: Role.STUDENT, fullName: 'Student' };
  const jwt = { signAsync: jest.fn(async () => 'long-refresh-token'), decode: () => ({ exp: Math.floor(Date.now() / 1000) + 3600 }), verifyAsync: jest.fn(async () => ({ sub: user.id, email: user.email, role: user.role, ...binding })) };
  let row: any;
  const sessions = { save: jest.fn(async value => { row = value; }), findOne: jest.fn(async () => row), delete: jest.fn() };
  const attempt = { examId: 'exam', activeSessionId: 'session' };
  const users = { setRefreshTokenHash: jest.fn(), getRefreshTokenHash: jest.fn() };
  const db = { getRepository: (e: { name: string }) => e.name === 'AttemptEntity' ? { findOne: async () => attempt } : sessions };
  const service = new AuthService(users as never, jwt as never, new ConfigService({}), { logEvent: jest.fn() } as never, db as never);
  return { service, binding, user, sessions, users, attempt, jwt };
}
it('keeps exam token issuance, refresh and logout independent of the browser session', async () => {
  const { service, binding, user, sessions, users, jwt } = setup();
  await service.startSessionForUser(user, null, {}, binding);
  expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining(binding), expect.anything());
  expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'session', examId: 'exam', userId: 'student' }));
  // Hash the full token before bcrypt's 72-byte truncation boundary.
  expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), 12);
  await expect(service.refresh('long-refresh-token', null)).resolves.toHaveProperty('accessToken');
  await service.logout('student', null, 'session');
  expect(sessions.delete).toHaveBeenCalledWith({ id: 'session', userId: 'student' });
  expect(users.setRefreshTokenHash).not.toHaveBeenCalled();
});
it('refuses a displaced session refresh without revoking the browser session', async () => {
  const { service, binding, user, users, attempt } = setup();
  await service.startSessionForUser(user, null, {}, binding);
  attempt.activeSessionId = 'new-session';
  await expect(service.refresh('long-refresh-token', null)).rejects.toMatchObject({ response: { code: 'SESSION_MOVED' } });
  expect(users.setRefreshTokenHash).not.toHaveBeenCalled();
});
