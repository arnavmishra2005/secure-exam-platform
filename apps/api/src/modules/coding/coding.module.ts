import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionModule } from '../execution/execution.module';
import { CodeRunEntity } from './entities/code-run.entity';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

/**
 * Owner: Person B. Coding questions: authoring, run/submit during an
 * attempt, and grading. Controllers and services land on Days 2–3.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CodingProblemEntity,
      CodingTestCaseEntity,
      CodeRunEntity,
      CodeSubmissionEntity,
    ]),
    ExecutionModule,
  ],
})
export class CodingModule {}
