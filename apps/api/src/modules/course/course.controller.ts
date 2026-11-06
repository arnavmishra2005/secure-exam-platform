// Owner: Person A (Platform, Courses, Publish, Results)

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission, Role, STAFF_ROLES } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import {
  AddCourseStaffDto,
  BulkImportStudentsDto,
  CreateCourseDto,
  CreateStudentDto,
  EnrollStudentsDto,
  UpdateCourseDto,
  UpdateCourseStaffDto,
} from '@secure-exam/validation';
import { RequireCourseStaff, RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CourseStaffService } from './course-staff.service';
import { CourseService } from './course.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly staffService: CourseStaffService,
  ) {}

  /** The courses the caller teaches or assists on. */
  @Get()
  @Roles(...STAFF_ROLES)
  list(@CurrentUser() user: JwtPayload) {
    return this.courseService.list(user);
  }

  /** Instructors only; the creator becomes the course's first instructor. */
  @Post()
  @Roles(Role.INSTRUCTOR)
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.create(dto, user.sub);
  }

  @Get(':id')
  @RequireCourseStaff({ course: 'id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.courseService.findOne(id, user);
  }

  @Patch(':id')
  @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.courseService.remove(id, user.sub);
  }

  // ---- Students ----

  @Get(':id/students')
  @RequireCourseStaff({ course: 'id' })
  listStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.listEnrollments(id);
  }

  /** Enrol existing students (students.id, users.id or college IDs). */
  @Post(':id/students')
  @RequirePermission(Permission.STUDENTS_MANAGE, { course: 'id' })
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollStudentsDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.enroll(id, dto.studentIds, user.sub);
  }

  /** A new student account, enrolled in this course. */
  @Post(':id/students/create')
  @RequirePermission(Permission.STUDENTS_MANAGE, { course: 'id' })
  createStudent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateStudentDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.createStudent(id, dto, user.sub);
  }

  /** CSV rows: new accounts are created, and every listed student is enrolled. */
  @Post(':id/students/import')
  @RequirePermission(Permission.STUDENTS_MANAGE, { course: 'id' })
  importStudents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkImportStudentsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courseService.importStudents(id, dto.students, user.sub);
  }

  @Delete(':id/students/:studentId')
  @RequirePermission(Permission.STUDENTS_MANAGE, { course: 'id' })
  unenroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courseService.unenroll(id, studentId, user.sub);
  }

  // ---- Staff: instructors and TAs ----

  @Get(':id/staff')
  @RequireCourseStaff({ course: 'id' })
  listStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.list(id);
  }

  /** Instructors only. A new email creates a TA account. */
  @Post(':id/staff')
  @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
  addStaff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCourseStaffDto, @CurrentUser() user: JwtPayload) {
    return this.staffService.add(id, dto, user.sub);
  }

  /** Instructors only: what a TA may do on this course. */
  @Patch(':id/staff/:userId')
  @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
  updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateCourseStaffDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.staffService.updatePermissions(id, userId, dto, user.sub);
  }

  @Delete(':id/staff/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
  removeStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.staffService.remove(id, userId, user.sub);
  }
}
