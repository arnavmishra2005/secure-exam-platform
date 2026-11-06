import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission, STAFF_ROLES } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission, StaffAccess } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExamService } from './exam.service';
import { AssignStudentDto, CreateExamDto, RescheduleExamDto, UpdateExamDto } from '@secure-exam/validation';

/**
 * Every exam belongs to one course; its instructors and TAs (with the
 * permission) manage it. Person A: access rules and reschedule.
 */
@ApiTags('exams')
@ApiBearerAuth()
@Controller('exams')
@RequirePermission(Permission.EXAM_EDIT, { exam: 'id' })
export class ExamController {
  constructor(
    private readonly examService: ExamService,
    private readonly access: AccessService,
  ) {}

  @Post()
  @RequirePermission(Permission.EXAM_EDIT)
  async create(@Body() dto: CreateExamDto, @CurrentUser() user: JwtPayload) {
    await this.access.assertCourse(user, dto.courseId, Permission.EXAM_EDIT);
    return this.examService.create(dto, user.sub);
  }

  @Get()
  @RequirePermission(Permission.EXAM_VIEW)
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.examService.findAll(await this.access.courseIdsFor(user, Permission.EXAM_VIEW));
  }

  /** Any staff member of the owning course (the results and monitoring pages show the exam's details too). */
  @Get(':id')
  @Roles(...STAFF_ROLES)
  @StaffAccess(undefined, { exam: 'id' })
  findOne(@Param('id') id: string) {
    return this.examService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.examService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.examService.remove(id, user.sub);
  }

  @Post(':id/schedule')
  schedule(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.examService.schedule(id, user.sub);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.examService.start(id, user.sub);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.examService.close(id, user.sub);
  }

  /** Move the exam's times after it left draft (rules in ExamService.reschedule). */
  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@Param('id') id: string, @Body() dto: RescheduleExamDto, @CurrentUser() user: JwtPayload) {
    return this.examService.reschedule(id, dto, user.sub);
  }

  @Get(':id/students')
  @RequirePermission(Permission.EXAM_VIEW, { exam: 'id' })
  listStudents(@Param('id') id: string) {
    return this.examService.listAssignedStudents(id);
  }

  @Post(':id/students')
  assignStudent(
    @Param('id') id: string,
    @Body() dto: AssignStudentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.examService.assignStudent(id, dto.studentId, user.sub);
  }

  @Delete(':id/students/:studentId')
  @HttpCode(204)
  unassignStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.examService.unassignStudent(id, studentId, user.sub);
  }
}
