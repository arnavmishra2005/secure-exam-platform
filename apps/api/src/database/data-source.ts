// [SHARED] Used only by the `typeorm` CLI (migration:generate/run/revert).
// The running app itself configures TypeORM via app.module.ts, not this file.

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AuditEventEntity } from '../modules/audit/entities/audit-event.entity';
import { StudentEntity } from '../modules/user/entities/student.entity';
import { UserEntity } from '../modules/user/entities/user.entity';
// Person B entities
import { ExamEntity } from '../modules/exam/entities/exam.entity';
import { ExamAssignmentEntity } from '../modules/exam/entities/exam-assignment.entity';
import { QuestionEntity } from '../modules/question/entities/question.entity';
import { OptionEntity } from '../modules/question/entities/option.entity';
import { ExamQuestionEntity } from '../modules/question/entities/exam-question.entity';
// Person C entities
import { AttemptEntity } from '../modules/attempt/entities/attempt.entity';
import { ExamSessionEntity } from '../modules/attempt/entities/exam-session.entity';
import { AnswerEntity } from '../modules/answer/entities/answer.entity';
import { SubmissionEntity } from '../modules/answer/entities/submission.entity';
import { ResultEntity } from '../modules/answer/entities/result.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    // Person A
    UserEntity,
    StudentEntity,
    AuditEventEntity,
    // Person B
    ExamEntity,
    ExamAssignmentEntity,
    QuestionEntity,
    OptionEntity,
    ExamQuestionEntity,
    // Person C
    AttemptEntity,
    ExamSessionEntity,
    AnswerEntity,
    SubmissionEntity,
    ResultEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
