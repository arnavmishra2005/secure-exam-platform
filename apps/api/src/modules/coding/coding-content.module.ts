import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodingContentService } from './coding-content.service';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

/**
 * Owner: Person B. Coding problem content for other modules (the answer
 * module's student question list). Must not import attempt/answer modules.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodingProblemEntity, CodingTestCaseEntity])],
  providers: [CodingContentService],
  exports: [CodingContentService],
})
export class CodingContentModule {}
