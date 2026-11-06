// Owner: Person A (Identity/Auth/Security)
// Students are global accounts managed through courses: staff see only the
// students enrolled in courses where they may manage students. New students
// are created inside a course (POST /courses/:id/students/create|import).

import { Body, Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateStudentDto } from '@secure-exam/validation';
import { Permission, STAFF_ROLES } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserService } from './user.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(Permission.STUDENTS_MANAGE)
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.userService.listStudentsInCourses(await this.access.courseIdsFor(user, Permission.STUDENTS_MANAGE));
  }

  /** GET /students/lookup?collegeId=CS001
   *  Resolves an exact college ID → student record, so staff can enrol or
   *  register a student who isn't in any of their courses yet. */
  @Get('lookup')
  @Roles(...STAFF_ROLES)
  async lookupByCollegeId(@Query('collegeId') collegeId: string) {
    if (!collegeId) throw new NotFoundException('collegeId query param is required');
    const student = await this.userService.findByCollegeId(collegeId);
    if (!student) throw new NotFoundException(`No student found with college ID "${collegeId}"`);
    return {
      id: student.id,
      collegeId: student.collegeId,
      fullName: student.user.fullName,
      email: student.user.email,
      isActive: student.user.isActive,
    };
  }

  /** GET /students/:id — a student enrolled in one of the caller's courses. */
  @Get(':id')
  @RequirePermission(Permission.STUDENTS_MANAGE, { student: 'id' })
  async findOne(@Param('id') id: string) {
    const student = await this.userService.findStudentById(id);
    if (!student) throw new NotFoundException(`Student not found`);
    return {
      id: student.id,
      collegeId: student.collegeId,
      fullName: student.user.fullName,
      email: student.user.email,
      isActive: student.user.isActive,
    };
  }

  @Patch(':id')
  @RequirePermission(Permission.STUDENTS_MANAGE, { student: 'id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.updateStudent(id, dto, user.sub);
  }
}
