import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamModule } from '../exam/exam.module';
import { QuestionEntity } from './entities/question.entity';
import { OptionEntity } from './entities/option.entity';
import { ExamQuestionEntity } from './entities/exam-question.entity';
import { QuestionTagEntity } from './entities/question-tag.entity';
import { TopicEntity } from './entities/topic.entity';
import { QuestionLockService } from './question-lock.service';
import { QuestionService } from './question.service';
import { QuestionController } from './question.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuestionEntity,
      OptionEntity,
      ExamQuestionEntity,
      TopicEntity,
      QuestionTagEntity,
    ]),
    // Imported for the ExamEntity repository (exam-exists checks).
    ExamModule,
  ],
  controllers: [QuestionController],
  providers: [QuestionService, QuestionLockService],
  exports: [QuestionService, QuestionLockService],
})
export class QuestionModule {}
