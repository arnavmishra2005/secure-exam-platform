import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamEntity } from './entities/exam.entity';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';
import { CourseModule } from '../course/course.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamEntity]),
    // Person A: assignments are exam registrations now.
    CourseModule,
  ],
  controllers: [ExamController],
  providers: [ExamService],
  // Re-export TypeOrmModule so QuestionModule can inject the ExamEntity
  // repository directly without importing ExamService.
  exports: [ExamService, TypeOrmModule],
})
export class ExamModule {}

