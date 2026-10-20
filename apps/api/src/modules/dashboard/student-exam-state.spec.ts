import { AttemptStatus, ExamStatus, StudentExamState } from '@secure-exam/types';
import { classifyStudentExam } from './student-exam-state';

describe('classifyStudentExam', () => {
  const now = new Date('2026-05-01T10:30:00Z');
  const window = { startTime: new Date('2026-05-01T10:00:00Z'), endTime: new Date('2026-05-01T12:00:00Z') };

  it('is LIVE for an active exam inside its window that the student has not started', () => {
    expect(classifyStudentExam({ ...window, status: ExamStatus.ACTIVE }, null, now)).toBe(StudentExamState.LIVE);
  });

  it('is UPCOMING while scheduled, even inside the window', () => {
    expect(classifyStudentExam({ ...window, status: ExamStatus.SCHEDULED }, null, now)).toBe(StudentExamState.UPCOMING);
  });

  it('is UPCOMING for an active exam before its start time', () => {
    const early = new Date('2026-05-01T09:00:00Z');
    expect(classifyStudentExam({ ...window, status: ExamStatus.ACTIVE }, null, early)).toBe(StudentExamState.UPCOMING);
  });

  it('is MISSED once the window ends or the exam closes without an attempt', () => {
    const late = new Date('2026-05-01T13:00:00Z');
    expect(classifyStudentExam({ ...window, status: ExamStatus.ACTIVE }, null, late)).toBe(StudentExamState.MISSED);
    expect(classifyStudentExam({ ...window, status: ExamStatus.CLOSED }, null, now)).toBe(StudentExamState.MISSED);
  });

  it('keeps a running attempt LIVE even after the window, until the server finalizes it', () => {
    const late = new Date('2026-05-01T13:00:00Z');
    expect(classifyStudentExam({ ...window, status: ExamStatus.CLOSED }, AttemptStatus.IN_PROGRESS, late)).toBe(
      StudentExamState.LIVE,
    );
  });

  it('is COMPLETED after a manual or automatic submission', () => {
    expect(classifyStudentExam({ ...window, status: ExamStatus.ACTIVE }, AttemptStatus.SUBMITTED, now)).toBe(
      StudentExamState.COMPLETED,
    );
    expect(classifyStudentExam({ ...window, status: ExamStatus.ACTIVE }, AttemptStatus.AUTO_SUBMITTED, now)).toBe(
      StudentExamState.COMPLETED,
    );
  });
});
