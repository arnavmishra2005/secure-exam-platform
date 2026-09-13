import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@secure-exam/types';
import type { BulkImportResult, JwtPayload } from '@secure-exam/types';
import { QuestionService } from './question.service';
import {
  AddQuestionToExamDto,
  CreateOptionDto,
  CreateQuestionDto,
  ReorderExamQuestionsDto,
  UpdateQuestionDto,
} from './dto';

@ApiTags('questions')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  // ---- Question bank ----

  @Post('questions')
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: JwtPayload) {
    return this.questionService.create(dto, user.sub);
  }

  @Get('questions')
  findAll() {
    return this.questionService.findAll();
  }

  @Get('questions/:id')
  findOne(@Param('id') id: string) {
    return this.questionService.findOne(id);
  }

  @Patch('questions/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.questionService.update(id, dto, user.sub);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.questionService.remove(id, user.sub);
  }

  // ---- Options ----

  @Post('questions/:id/options')
  addOption(@Param('id') id: string, @Body() dto: CreateOptionDto) {
    return this.questionService.addOption(id, dto);
  }

  @Patch('questions/:id/options/:optionId')
  updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() dto: Partial<CreateOptionDto>,
  ) {
    return this.questionService.updateOption(id, optionId, dto);
  }

  @Delete('questions/:id/options/:optionId')
  @HttpCode(204)
  deleteOption(@Param('id') id: string, @Param('optionId') optionId: string) {
    return this.questionService.deleteOption(id, optionId);
  }

  // ---- Exam <-> Question mapping ----
  // NOTE: these live under /exams/:examId/... but are registered here
  // (not in ExamController) because Person B owns Question/ExamQuestion.

  @Get('exams/:examId/questions')
  getExamQuestions(@Param('examId') examId: string) {
    return this.questionService.getExamQuestions(examId);
  }

  @Post('exams/:examId/questions')
  addQuestionToExam(
    @Param('examId') examId: string,
    @Body() dto: AddQuestionToExamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.questionService.addQuestionToExam(examId, dto, user.sub);
  }

  @Delete('exams/:examId/questions/:questionId')
  @HttpCode(204)
  removeQuestionFromExam(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.questionService.removeQuestionFromExam(examId, questionId, user.sub);
  }

  @Patch('exams/:examId/questions/reorder')
  reorder(@Param('examId') examId: string, @Body() dto: ReorderExamQuestionsDto) {
    return this.questionService.reorder(examId, dto);
  }

  // ---- Bulk import ----

  @Post('questions/import')
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(
    @UploadedFile() file: { buffer: Buffer; [key: string]: any },
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkImportResult> {
    if (!file) throw new BadRequestException('No file uploaded (expected field name "file")');
    return this.questionService.bulkImport(file.buffer.toString('utf-8'), user.sub);
  }
}
