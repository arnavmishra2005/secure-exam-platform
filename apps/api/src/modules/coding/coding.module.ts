import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerModule } from '../answer/answer.module';
import { ExecutionModule } from '../execution/execution.module';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { AttemptAccessAdapter } from './attempt-access/attempt-access.adapter';
import { ATTEMPT_ACCESS } from './attempt-access/attempt-access.interface';
import { CodeRunController } from './code-run.controller';
import { CodeGradingService } from './code-grading.service';
import { CodeRunService } from './code-run.service';
import { CodeSubmitService } from './code-submit.service';
import { CodingQuestionResolver } from './coding-question.resolver';
import { CODE_SCORE_SINK } from './score-sink/code-score-sink.interface';
import { ResultTableScoreSink } from './score-sink/result-table-score-sink';
import { CodeRunEntity } from './entities/code-run.entity';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

/**
 * Owner: Person B. Coding questions during an attempt: run, submit, and
 * end-of-attempt grading. Problem content for other modules lives in
 * CodingContentModule, which must not import this one.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CodingProblemEntity,
      CodingTestCaseEntity,
      CodeRunEntity,
      CodeSubmissionEntity,
      QuestionEntity,
      ExamQuestionEntity,
    ]),
    ExecutionModule,
    // For SubmissionService, behind ATTEMPT_ACCESS.
    AnswerModule,
  ],
  controllers: [CodeRunController],
  providers: [
    CodingQuestionResolver,
    CodeRunService,
    CodeSubmitService,
    CodeGradingService,
    { provide: ATTEMPT_ACCESS, useClass: AttemptAccessAdapter },
    // Swap for Person A's ScoreRecorder at merge (see score-sink/).
    { provide: CODE_SCORE_SINK, useClass: ResultTableScoreSink },
  ],
})
export class CodingModule {}
