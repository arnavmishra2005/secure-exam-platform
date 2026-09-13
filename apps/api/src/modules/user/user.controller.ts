// Owner: Person A (Identity/Auth/Security)

import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BulkImportStudentsDto,
  CreateStudentDto,
  UpdateStudentDto,
} from '@secure-exam/validation';
import { Role } from '@secure-exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserService } from './user.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.listStudents();
  }

  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: { sub: string }) {
    return this.userService.createStudent(dto, user.sub);
  }

  @Post('bulk-import')
  bulkImport(
    @Body() dto: BulkImportStudentsDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.userService.bulkImportStudents(dto.students, user.sub);
  }

  /** GET /students/lookup?collegeId=CS001
   *  Resolves a human-readable college ID → full student record.
   *  Used by the exam assignment UI before submitting the UUID. */
  @Get('lookup')
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

  /** GET /students/:id — fetch single student by UUID */
  @Get(':id')
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.userService.updateStudent(id, dto, user.sub);
  }
}
