import { AttemptAccessAdapter } from './attempt-access.adapter';
it.each([false, true])('grades drafts only when the exam allows them (%s)', async gradeUnsubmittedCode => {
  const answers = { findOne: jest.fn(async () => ({ textResponse: 'print(1)' })) };
  const db = { getRepository: (e: { name: string }) => e.name === 'AttemptEntity' ? { findOne: async () => ({ examId: 'exam' }) } : e.name === 'ExamEntity' ? { findOne: async () => ({ gradeUnsubmittedCode }) } : answers };
  const service = new AttemptAccessAdapter({} as never, db as never);
  await expect(service.getDraftCode('attempt', 'question')).resolves.toBe(gradeUnsubmittedCode ? 'print(1)' : null);
  expect(answers.findOne).toHaveBeenCalledTimes(gradeUnsubmittedCode ? 1 : 0);
});
