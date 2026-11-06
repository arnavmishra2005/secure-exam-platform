import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@secure-exam/types';
import type {
  BankQuestionDetail,
  BankQuestionPage,
  BulkAddToExamResult,
  BulkImportResult,
  JwtPayload,
  TagCount,
  Topic,
  ValidateCodingResponse,
} from '@secure-exam/types';
import {
  BankQuestionQueryDto,
  BulkAddToExamDto,
  CreateTopicDto,
  SaveBankQuestionDto,
  TagQueryDto,
  TopicQueryDto,
  UpdateBankQuestionMetaDto,
  ValidateCodingDto,
} from '@secure-exam/validation';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CodingValidationService } from './coding-validation.service';
import { QuestionBankImportService } from './question-bank-import.service';
import { QuestionBankService } from './question-bank.service';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Owner: Person B. Staff-only question bank. Responses include answer keys,
 * hidden tests and reference solutions — never expose these to students.
 *
 * Person A: each instructor has their own bank; their TAs with
 * QUESTION_BANK_VIEW/EDIT on one of their courses use it too.
 */
@ApiTags('question-bank')
@ApiBearerAuth()
@Controller()
@RequirePermission(Permission.QUESTION_BANK_EDIT, { question: 'id' })
export class QuestionBankController {
  constructor(
    private readonly bank: QuestionBankService,
    private readonly importer: QuestionBankImportService,
    private readonly validator: CodingValidationService,
    private readonly access: AccessService,
  ) {}

  @Get('question-bank/questions')
  @RequirePermission(Permission.QUESTION_BANK_VIEW)
  async list(@Query() query: BankQuestionQueryDto, @CurrentUser() user: JwtPayload): Promise<BankQuestionPage> {
    return this.bank.list(query, await this.access.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW));
  }

  @Get('question-bank/questions/:id')
  @RequirePermission(Permission.QUESTION_BANK_VIEW, { question: 'id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BankQuestionDetail> {
    return this.bank.get(id);
  }

  /** Goes into the caller's bank (a TA: the bank of `courseId`'s instructor). */
  @Post('question-bank/questions')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  async create(@Body() dto: SaveBankQuestionDto, @CurrentUser() user: JwtPayload): Promise<BankQuestionDetail> {
    const ownerId = await this.access.resolveBankOwner(user, dto.courseId);
    return this.bank.create(dto, user.sub, ownerId);
  }

  /** Replace the whole question. 409 while it is in an ACTIVE/CLOSED exam. */
  @Put('question-bank/questions/:id')
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveBankQuestionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BankQuestionDetail> {
    if (dto.courseId) await this.access.assertCourse(user, dto.courseId);
    return this.bank.replace(id, dto, user.sub);
  }

  /** Course / topic / difficulty / status / tags; allowed even when locked. */
  @Patch('question-bank/questions/:id/meta')
  async updateMeta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankQuestionMetaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BankQuestionDetail> {
    if (dto.courseId) await this.access.assertCourse(user, dto.courseId);
    return this.bank.updateMeta(id, dto, user.sub);
  }

  @Post('question-bank/questions/:id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<BankQuestionDetail> {
    return this.bank.duplicate(id, user.sub);
  }

  @Delete('question-bank/questions/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.bank.remove(id, user.sub);
  }

  /** Header-based CSV (see question-bank-import.service.ts), field name "file". */
  @Post('question-bank/import')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  async importCsv(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkImportResult> {
    if (!file) throw new BadRequestException('No file uploaded (expected field name "file")');
    const ownerId = await this.access.resolveBankOwner(user);
    return this.importer.importCsv(file.buffer.toString('utf-8'), user.sub, ownerId);
  }

  /** Run the reference solution (or `code`) against the problem's tests, before saving. */
  @Post('question-bank/validate-coding')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  @HttpCode(200)
  validateCoding(@Body() dto: ValidateCodingDto, @CurrentUser() user: JwtPayload): Promise<ValidateCodingResponse> {
    return this.validator.validate(dto, user.sub);
  }

  @Get('question-bank/topics')
  @RequirePermission(Permission.QUESTION_BANK_VIEW)
  async listTopics(@Query() query: TopicQueryDto, @CurrentUser() user: JwtPayload): Promise<Topic[]> {
    return this.bank.listTopics(query.courseId, await this.access.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW));
  }

  @Post('question-bank/topics')
  @RequirePermission(Permission.QUESTION_BANK_EDIT)
  async createTopic(@Body() dto: CreateTopicDto, @CurrentUser() user: JwtPayload): Promise<Topic> {
    return this.bank.createTopic(dto, await this.access.resolveBankOwner(user, dto.courseId));
  }

  @Delete('question-bank/topics/:id')
  @HttpCode(204)
  @RequirePermission(Permission.QUESTION_BANK_EDIT, { topic: 'id' })
  deleteTopic(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bank.deleteTopic(id);
  }

  @Get('question-bank/tags')
  @RequirePermission(Permission.QUESTION_BANK_VIEW)
  async listTags(@Query() query: TagQueryDto, @CurrentUser() user: JwtPayload): Promise<TagCount[]> {
    return this.bank.listTags(query.search, await this.access.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW));
  }

  /** Add several READY bank questions to an exam (DRAFT/SCHEDULED only). */
  @Post('exams/:examId/questions/bulk')
  @HttpCode(200)
  @RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
  async bulkAdd(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: BulkAddToExamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkAddToExamResult> {
    const ownerIds = await this.access.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW);
    return this.bank.bulkAddToExam(examId, dto.questionIds, user.sub, ownerIds);
  }
}
