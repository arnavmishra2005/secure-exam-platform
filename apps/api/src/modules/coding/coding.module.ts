import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerModule } from '../answer/answer.module';
import { ExecutionModule } from '../execution/execution.module';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { AttemptAccessAdapter } from './attempt-access/attempt-access.adapter';
import { ATTEMPT_ACCESS } from './attempt-access/attempt-access.interface';
import { CodeRunController } from './code-run.controller';
import { CodeRunService } from './code-run.service';
import { CodeRunEntity } from './entities/code-run.entity';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

/**
 * Owner: Person B. Coding questions: authoring, run/submit during an
 * attempt, and grading.
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
  providers: [CodeRunService, { provide: ATTEMPT_ACCESS, useClass: AttemptAccessAdapter }],
})
export class CodingModule {}
