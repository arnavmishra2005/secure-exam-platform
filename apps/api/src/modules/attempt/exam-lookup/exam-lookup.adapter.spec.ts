import { ExamLookupAdapter } from './exam-lookup.adapter';

describe('ExamLookupAdapter.isStudentAssignedToExam', () => {
  // The caller passes the JWT `sub`, which is a users.id.
  const USER_ID = 'user-1';

  function adapterWithAssignments(assignments: Promise<unknown[]>) {
    const examService = { listAssignedStudents: jest.fn().mockReturnValue(assignments) };
    return new ExamLookupAdapter(examService as any);
  }

  it('finds a student assigned by students.id through their userId', async () => {
    const adapter = adapterWithAssignments(Promise.resolve([{ studentId: 'student-row-1', userId: USER_ID }]));

    await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(true);
  });

  it('finds a student assigned directly by users.id', async () => {
    const adapter = adapterWithAssignments(Promise.resolve([{ studentId: USER_ID, userId: undefined }]));

    await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(true);
  });

  it('rejects a student who is not among the assignments', async () => {
    const adapter = adapterWithAssignments(Promise.resolve([{ studentId: 'student-row-2', userId: 'user-2' }]));

    await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(false);
  });

  it('allows everyone when the exam has no assignments', async () => {
    const adapter = adapterWithAssignments(Promise.resolve([]));

    await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(true);
  });
});
