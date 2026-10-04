import React, { createContext, useContext, useEffect, useState } from 'react';
import { Attempt, AttemptStatus, Exam, ExamStatus, PublicQuestion, QuestionType } from '@secure-exam/types';

export interface AttemptContextValue {
  attempt: Attempt | null;
  exam: Exam | null;
  questions: PublicQuestion[];
  isLoading: boolean;
  error: string | null;
  remainingSeconds: number;
  submitAttempt: () => Promise<void>;
  isSubmitting: boolean;
}

const AttemptContext = createContext<AttemptContextValue | undefined>(undefined);

// Sample fixture questions for development and testing
const SAMPLE_EXAM: Exam = {
  id: 'e0000000-0000-0000-0000-000000000001',
  title: 'Sample Examination - Operating Systems & Networking',
  description: 'Midterm evaluation covering processes, memory management, and OSI model.',
  durationMinutes: 60,
  startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  endTime: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  status: ExamStatus.ACTIVE,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createSampleAttempt = (): Attempt => ({
  id: 'a0000000-0000-0000-0000-000000000001',
  examId: SAMPLE_EXAM.id,
  studentId: 's0000000-0000-0000-0000-000000000001',
  status: AttemptStatus.IN_PROGRESS,
  startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  submittedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const SAMPLE_QUESTIONS: PublicQuestion[] = [
  {
    id: 'q0000000-0000-0000-0000-000000000001',
    text: 'Which of the following scheduling algorithms can lead to starvation if lower priority processes arrive continuously?',
    type: QuestionType.MCQ_SINGLE,
    marks: 2,
    negativeMarks: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: [
      { id: 'opt-1-1', questionId: 'q0000000-0000-0000-0000-000000000001', text: 'Round Robin (RR)', order: 1 },
      { id: 'opt-1-2', questionId: 'q0000000-0000-0000-0000-000000000001', text: 'Priority Scheduling (non-preemptive)', order: 2 },
      { id: 'opt-1-3', questionId: 'q0000000-0000-0000-0000-000000000001', text: 'First-Come, First-Served (FCFS)', order: 3 },
      { id: 'opt-1-4', questionId: 'q0000000-0000-0000-0000-000000000001', text: 'Completely Fair Scheduler with Aging', order: 4 },
    ],
  },
  {
    id: 'q0000000-0000-0000-0000-000000000002',
    text: 'Select all protocols that operate at the Transport Layer of the OSI model:',
    type: QuestionType.MCQ_MULTI,
    marks: 3,
    negativeMarks: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: [
      { id: 'opt-2-1', questionId: 'q0000000-0000-0000-0000-000000000002', text: 'Transmission Control Protocol (TCP)', order: 1 },
      { id: 'opt-2-2', questionId: 'q0000000-0000-0000-0000-000000000002', text: 'User Datagram Protocol (UDP)', order: 2 },
      { id: 'opt-2-3', questionId: 'q0000000-0000-0000-0000-000000000002', text: 'Internet Protocol (IP)', order: 3 },
      { id: 'opt-2-4', questionId: 'q0000000-0000-0000-0000-000000000002', text: 'Address Resolution Protocol (ARP)', order: 4 },
    ],
  },
  {
    id: 'q0000000-0000-0000-0000-000000000003',
    text: 'A deadlock can occur even if mutual exclusion condition is not satisfied.',
    type: QuestionType.TRUE_FALSE,
    marks: 1,
    negativeMarks: 0.25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: [
      { id: 'opt-3-1', questionId: 'q0000000-0000-0000-0000-000000000003', text: 'True', order: 1 },
      { id: 'opt-3-2', questionId: 'q0000000-0000-0000-0000-000000000003', text: 'False', order: 2 },
    ],
  },
  {
    id: 'q0000000-0000-0000-0000-000000000004',
    text: 'What is the primary purpose of virtual memory in modern operating systems?',
    type: QuestionType.MCQ_SINGLE,
    marks: 2,
    negativeMarks: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: [
      { id: 'opt-4-1', questionId: 'q0000000-0000-0000-0000-000000000004', text: 'To allow processes to share the CPU cache efficiently', order: 1 },
      { id: 'opt-4-2', questionId: 'q0000000-0000-0000-0000-000000000004', text: 'To provide each process with a contiguous address space and allow execution of processes larger than physical RAM', order: 2 },
      { id: 'opt-4-3', questionId: 'q0000000-0000-0000-0000-000000000004', text: 'To completely eliminate page faults during disk I/O', order: 3 },
      { id: 'opt-4-4', questionId: 'q0000000-0000-0000-0000-000000000004', text: 'To convert dynamic RAM into static RAM dynamically', order: 4 },
    ],
  },
  {
    id: 'q0000000-0000-0000-0000-000000000005',
    text: 'Which of the following are valid IP addresses belonging to private network ranges (RFC 1918)?',
    type: QuestionType.MCQ_MULTI,
    marks: 3,
    negativeMarks: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: [
      { id: 'opt-5-1', questionId: 'q0000000-0000-0000-0000-000000000005', text: '10.24.100.1', order: 1 },
      { id: 'opt-5-2', questionId: 'q0000000-0000-0000-0000-000000000005', text: '172.20.14.88', order: 2 },
      { id: 'opt-5-3', questionId: 'q0000000-0000-0000-0000-000000000005', text: '8.8.8.8', order: 3 },
      { id: 'opt-5-4', questionId: 'q0000000-0000-0000-0000-000000000005', text: '192.168.1.254', order: 4 },
    ],
  },
];

interface Props {
  children: React.ReactNode;
  initialAttempt?: Attempt;
  initialExam?: Exam;
  initialQuestions?: PublicQuestion[];
  onSubmit?: () => Promise<void>;
}

export const AttemptProvider: React.FC<Props> = ({
  children,
  initialAttempt,
  initialExam = SAMPLE_EXAM,
  initialQuestions = SAMPLE_QUESTIONS,
  onSubmit,
}) => {
  const [attempt, setAttempt] = useState<Attempt | null>(() => initialAttempt || createSampleAttempt());
  const [exam, setExam] = useState<Exam | null>(initialExam);
  const [questions, setQuestions] = useState<PublicQuestion[]>(initialQuestions);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const att = initialAttempt || createSampleAttempt();
    if (!att.expiresAt) return 0;
    const diff = Math.floor((new Date(att.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  // Ticking countdown clock
  useEffect(() => {
    if (!attempt?.expiresAt) return;

    const timer = setInterval(() => {
      const diff = Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000);
      const remaining = Math.max(0, diff);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt?.expiresAt]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit();
      } else {
        // Fallback default action
        await new Promise((res) => setTimeout(res, 800));
        if (attempt) {
          setAttempt({
            ...attempt,
            status: AttemptStatus.SUBMITTED,
            submittedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit exam');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AttemptContext.Provider
      value={{
        attempt,
        exam,
        questions,
        isLoading,
        error,
        remainingSeconds,
        submitAttempt: handleSubmit,
        isSubmitting,
      }}
    >
      {children}
    </AttemptContext.Provider>
  );
};

export function useAttemptContext(): AttemptContextValue {
  const ctx = useContext(AttemptContext);
  if (!ctx) {
    throw new Error('useAttemptContext must be used within an AttemptProvider');
  }
  return ctx;
}
