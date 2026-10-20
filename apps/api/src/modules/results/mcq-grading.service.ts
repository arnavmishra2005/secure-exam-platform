// Owner: Person A (Platform, Courses, Publish, Results)
// Grades objective questions when an attempt is finalized and records the
// per-question scores through ScoreRecorder (which also updates Result.score).

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ATTEMPT_SUBMITTED, AttemptSubmittedEvent } from '../../common/events/events';
import { SCORE_RECORDER, ScoreRecorder } from '../../common/scoring/score-recorder.interface';
import { AnswerEntity } from '../answer/entities/answer.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { QuestionService } from '../question/question.service';
import { evaluateObjectiveAnswers } from './mcq-evaluator';

@Injectable()
export class McqGradingService {
  private readonly logger = new Logger(McqGradingService.name);

  constructor(
    @InjectRepository(AttemptEntity)
    private readonly attemptRepo: Repository<AttemptEntity>,
    @InjectRepository(AnswerEntity)
    private readonly answerRepo: Repository<AnswerEntity>,
    private readonly questionService: QuestionService,
    @Inject(SCORE_RECORDER) private readonly scoreRecorder: ScoreRecorder,
  ) {}

  @OnEvent(ATTEMPT_SUBMITTED, { async: true })
  async onAttemptSubmitted(event: AttemptSubmittedEvent): Promise<void> {
    try {
      await this.gradeAttempt(event.attemptId);
    } catch (err) {
      // Result.score keeps the submit-time total; POST /results/exams/:id/recompute repairs it.
      this.logger.error(
        `MCQ grading failed for attempt ${event.attemptId}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /** Returns how many questions were graded. */
  async gradeAttempt(attemptId: string): Promise<number> {
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt) return 0;

    const [questions, answers] = await Promise.all([
      this.questionService.getExamQuestions(attempt.examId),
      this.answerRepo.find({ where: { attemptId } }),
    ]);
    const scores = evaluateObjectiveAnswers(
      questions.map((q) => ({
        id: q.id,
        type: q.type,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        options: (q.options ?? []).map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      })),
      answers.map((a) => ({ questionId: a.questionId, selectedOptionIds: a.selectedOptionIds })),
    );

    await this.scoreRecorder.recordMany(attemptId, scores);
    return scores.length;
  }
}
