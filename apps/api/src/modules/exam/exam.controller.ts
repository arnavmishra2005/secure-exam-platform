import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { ExamService } from './exam.service';
import { AssignStudentDto, CreateExamDto, UpdateExamDto } from '@secure-exam/validation';

@ApiTags('exams')
@ApiBearerAuth()
@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Post()
  create(@Body() dto: CreateExamDto, @CurrentUser() user: JwtPayload) {
    return this.examService.create(dto, user.sub);
  }

  @Get()
  findAll() {
    return this.examService.findAll();
  }

  @Get(':id')
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

  @Get(':id/students')
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
