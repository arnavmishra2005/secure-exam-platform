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
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CreateCourseDto, EnrollStudentsDto, UpdateCourseDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CourseService } from './course.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@Roles(Role.ADMIN)
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get()
  list() {
    return this.courseService.list();
  }

  @Post()
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.create(dto, user.sub);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.courseService.remove(id, user.sub);
  }

  @Get(':id/students')
  listStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.listEnrollments(id);
  }

  @Post(':id/students')
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollStudentsDto, @CurrentUser() user: JwtPayload) {
    return this.courseService.enroll(id, dto.studentIds, user.sub);
  }

  @Delete(':id/students/:studentId')
  unenroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courseService.unenroll(id, studentId, user.sub);
  }
}
