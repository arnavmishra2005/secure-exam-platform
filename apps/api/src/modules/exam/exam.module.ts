import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamEntity } from './entities/exam.entity';
import { ExamAssignmentEntity } from './entities/exam-assignment.entity';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';
import { StudentEntity } from '../user/entities/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamEntity, ExamAssignmentEntity, StudentEntity]),
  ],
  controllers: [ExamController],
  providers: [ExamService],
  // Re-export TypeOrmModule so QuestionModule can inject the ExamEntity
  // repository directly without importing ExamService.
  exports: [ExamService, TypeOrmModule],
})
export class ExamModule {}

