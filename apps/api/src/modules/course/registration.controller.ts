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
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AssignExamToCourseDto, EnrollStudentsDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RegistrationService } from './registration.service';

@ApiTags('registrations')
@ApiBearerAuth()
@Controller('exams/:examId')
@Roles(Role.ADMIN)
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Get('registrations')
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
  listCourses(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.registrationService.listCoursesForExam(examId);
  }

  /** Assigns a course: every enrolled student gets registered. */
  @Post('courses')
  assignCourse(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: AssignExamToCourseDto,
    @CurrentUser() user: JwtPayload,
  ) {
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
