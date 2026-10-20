/**
 * Owner: Person B
 * Hook to retrieve the questions for the current attempt.
 * Fetches them from the student endpoint GET /attempts/:attemptId/questions
 * (no answer key), or uses the sample questions for the demo attempt.
 */
import { useEffect, useState } from 'react';
import { PublicQuestion, QuestionType } from '@secure-exam/types';
import { getAttemptQuestions } from '@secure-exam/api-client';
import { isFixtureAttempt } from '../contexts/AttemptContext';

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

export function useExamQuestions(attemptId?: string) {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!attemptId) {
      // The attempt is still loading.
      setQuestions([]);
      setIsLoading(true);
      return;
    }
    if (isFixtureAttempt(attemptId)) {
      setQuestions(SAMPLE_QUESTIONS);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    // Never fall back to the sample questions here: answers to them would be
    // rejected by the server, since they don't belong to this attempt's exam.
    getAttemptQuestions(attemptId)
      .then((data) => {
        if (!isMounted) return;
        setQuestions(data);
        setError(data.length === 0 ? 'This exam has no questions yet. Please contact your invigilator.' : null);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not fetch questions from API', err);
        setQuestions([]);
        setError('Could not load the exam questions. Check your connection and try again.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [attemptId, reloadKey]);

  const retry = () => setReloadKey((key) => key + 1);

  return { questions, isLoading, error, retry };
}
