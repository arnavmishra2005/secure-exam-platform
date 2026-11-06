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
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '@secure-exam/types';
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
@RequirePermission(Permission.QUESTION_BANK_EDIT, { question: 'id' })
export class QuestionController {
  constructor(
    private readonly questionService: QuestionService,
    private readonly access: AccessService,
  ) {}

  // ---- Question bank (Phase 1 routes; the web app uses /question-bank) ----

  @Post('questions')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  async create(@Body() dto: CreateQuestionDto, @CurrentUser() user: JwtPayload) {
    return this.questionService.create(dto, user.sub, await this.access.resolveBankOwner(user));
  }

  @Get('questions')
  @RequirePermission(Permission.QUESTION_BANK_VIEW)
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.questionService.findAll(await this.access.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW));
  }

  @Get('questions/:id')
  @RequirePermission(Permission.QUESTION_BANK_VIEW, { question: 'id' })
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
  @RequirePermission(Permission.EXAM_VIEW, { exam: 'examId' })
  getExamQuestions(@Param('examId') examId: string) {
    return this.questionService.getExamQuestions(examId);
  }

  @Post('exams/:examId/questions')
  @RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
  async addQuestionToExam(
    @Param('examId') examId: string,
    @Body() dto: AddQuestionToExamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.access.assertQuestion(user, dto.questionId, Permission.QUESTION_BANK_VIEW);
    return this.questionService.addQuestionToExam(examId, dto, user.sub);
  }

  @Delete('exams/:examId/questions/:questionId')
  @HttpCode(204)
  @RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
  removeQuestionFromExam(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.questionService.removeQuestionFromExam(examId, questionId, user.sub);
  }

  @Patch('exams/:examId/questions/reorder')
  @RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
  reorder(@Param('examId') examId: string, @Body() dto: ReorderExamQuestionsDto) {
    return this.questionService.reorder(examId, dto);
  }

  // ---- Bulk import ----

  @Post('questions/import')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(
    @UploadedFile() file: { buffer: Buffer; [key: string]: any },
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkImportResult> {
    if (!file) throw new BadRequestException('No file uploaded (expected field name "file")');
    const ownerId = await this.access.resolveBankOwner(user);
    return this.questionService.bulkImport(file.buffer.toString('utf-8'), user.sub, ownerId);
  }
}
