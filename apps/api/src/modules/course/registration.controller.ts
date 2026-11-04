// Owner: Person A (Platform, Courses, Publish, Results)
// Exam registration endpoints live under /exams/:examId but are owned here,
// the same way Person B's /exams/:examId/questions lives in QuestionController.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AssignExamToCourseDto, EnrollStudentsDto } from '@secure-exam/validation';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegistrationService } from './registration.service';

@ApiTags('registrations')
@ApiBearerAuth()
@Controller('exams/:examId')
@RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly access: AccessService,
  ) {}

  @Get('registrations')
  @RequirePermission(Permission.EXAM_VIEW, { exam: 'examId' })
  list(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.registrationService.listForExam(examId);
  }

  /** Registers students individually (students.id, users.id or college IDs). */
  @Post('registrations')
  register(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: EnrollStudentsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrationService.registerStudents(examId, dto.studentIds, user.sub);
  }

  @Delete('registrations/:studentId')
  unregister(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrationService.unregisterStudent(examId, studentId, user.sub).then(() => ({ ok: true }));
  }

  @Get('courses')
  @RequirePermission(Permission.EXAM_VIEW, { exam: 'examId' })
  listCourses(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.registrationService.listCoursesForExam(examId);
  }

  /** Assigns a course: every enrolled student gets registered. The caller must edit exams on that course too. */
  @Post('courses')
  async assignCourse(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: AssignExamToCourseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.access.assertCourse(user, dto.courseId, Permission.EXAM_EDIT);
    return this.registrationService.assignCourse(examId, dto.courseId, user.sub);
  }

  @Delete('courses/:courseId')
  unassignCourse(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrationService.unassignCourse(examId, courseId, user.sub);
  }
}
