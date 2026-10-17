import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodingProblemEntity } from '../coding/entities/coding-problem.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionTagEntity } from '../question/entities/question-tag.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { TopicEntity } from '../question/entities/topic.entity';
import { ExecutionModule } from '../execution/execution.module';
import { QuestionModule } from '../question/question.module';
import { CodingValidationService } from './coding-validation.service';
import { QuestionBankImportService } from './question-bank-import.service';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';

/** Owner: Person B. Admin question bank (incl. coding problem authoring). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuestionEntity,
      TopicEntity,
      QuestionTagEntity,
      ExamQuestionEntity,
      CodingProblemEntity,
      CodingTestCaseEntity,
    ]),
    QuestionModule, // QuestionLockService
    ExecutionModule, // sandbox + shared run limiter, for validate-coding
  ],
  controllers: [QuestionBankController],
  providers: [QuestionBankService, QuestionBankImportService, CodingValidationService],
})
export class QuestionBankModule {}
