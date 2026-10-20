// [SHARED] Used only by the `typeorm` CLI (migration:generate/run/revert).
// The running app itself configures TypeORM via app.module.ts, not this file.

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AuditEventEntity } from '../modules/audit/entities/audit-event.entity';
import { StudentEntity } from '../modules/user/entities/student.entity';
import { UserEntity } from '../modules/user/entities/user.entity';
// Person B entities
import { ExamEntity } from '../modules/exam/entities/exam.entity';
import { QuestionEntity } from '../modules/question/entities/question.entity';
import { OptionEntity } from '../modules/question/entities/option.entity';
import { ExamQuestionEntity } from '../modules/question/entities/exam-question.entity';
import { TopicEntity } from '../modules/question/entities/topic.entity';
import { QuestionTagEntity } from '../modules/question/entities/question-tag.entity';
import { CodingProblemEntity } from '../modules/coding/entities/coding-problem.entity';
import { CodingTestCaseEntity } from '../modules/coding/entities/coding-test-case.entity';
import { CodeRunEntity } from '../modules/coding/entities/code-run.entity';
import { CodeSubmissionEntity } from '../modules/coding/entities/code-submission.entity';
// Person C entities
import { AttemptEntity } from '../modules/attempt/entities/attempt.entity';
import { ExamSessionEntity } from '../modules/attempt/entities/exam-session.entity';
import { AnswerEntity } from '../modules/answer/entities/answer.entity';
import { SubmissionEntity } from '../modules/answer/entities/submission.entity';
import { ResultEntity } from '../modules/answer/entities/result.entity';
// Phase 4 — Person A
import { CourseEntity } from '../modules/course/entities/course.entity';
import { CourseEnrollmentEntity } from '../modules/course/entities/course-enrollment.entity';
import { ExamCourseEntity } from '../modules/course/entities/exam-course.entity';
import { ExamRegistrationEntity } from '../modules/course/entities/exam-registration.entity';
import { NotificationEntity } from '../modules/notification/entities/notification.entity';
import { QuestionScoreEntity } from '../modules/results/entities/question-score.entity';
// Phase 4 — Person C
import { ExamExtensionEntity } from '../modules/extension/entities/exam-extension.entity';

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
    QuestionEntity,
    OptionEntity,
    ExamQuestionEntity,
    TopicEntity,
    QuestionTagEntity,
    CodingProblemEntity,
    CodingTestCaseEntity,
    CodeRunEntity,
    CodeSubmissionEntity,
    // Person C
    AttemptEntity,
    ExamSessionEntity,
    AnswerEntity,
    SubmissionEntity,
    ResultEntity,
    // Phase 4 — Person A
    CourseEntity,
    CourseEnrollmentEntity,
    ExamCourseEntity,
    ExamRegistrationEntity,
    NotificationEntity,
    QuestionScoreEntity,
    // Phase 4 — Person C
    ExamExtensionEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
