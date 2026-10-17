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
import { Role } from '@secure-exam/types';
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CodingValidationService } from './coding-validation.service';
import { QuestionBankImportService } from './question-bank-import.service';
import { QuestionBankService } from './question-bank.service';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Owner: Person B. Admin-only question bank. Responses include answer keys,
 * hidden tests and reference solutions — never expose these to students.
 */
@ApiTags('question-bank')
@ApiBearerAuth()
@Controller()
@Roles(Role.ADMIN)
export class QuestionBankController {
  constructor(
    private readonly bank: QuestionBankService,
    private readonly importer: QuestionBankImportService,
    private readonly validator: CodingValidationService,
  ) {}

  @Get('question-bank/questions')
  list(@Query() query: BankQuestionQueryDto): Promise<BankQuestionPage> {
    return this.bank.list(query);
  }

  @Get('question-bank/questions/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BankQuestionDetail> {
    return this.bank.get(id);
  }

  @Post('question-bank/questions')
  create(@Body() dto: SaveBankQuestionDto, @CurrentUser() user: JwtPayload): Promise<BankQuestionDetail> {
    return this.bank.create(dto, user.sub);
  }

  /** Replace the whole question. 409 while it is in an ACTIVE/CLOSED exam. */
  @Put('question-bank/questions/:id')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveBankQuestionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BankQuestionDetail> {
    return this.bank.replace(id, dto, user.sub);
  }

  /** Course / topic / difficulty / status / tags; allowed even when locked. */
  @Patch('question-bank/questions/:id/meta')
  updateMeta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankQuestionMetaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BankQuestionDetail> {
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  importCsv(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkImportResult> {
    if (!file) throw new BadRequestException('No file uploaded (expected field name "file")');
    return this.importer.importCsv(file.buffer.toString('utf-8'), user.sub);
  }

  /** Run the reference solution (or `code`) against the problem's tests, before saving. */
  @Post('question-bank/validate-coding')
  @HttpCode(200)
  validateCoding(@Body() dto: ValidateCodingDto, @CurrentUser() user: JwtPayload): Promise<ValidateCodingResponse> {
    return this.validator.validate(dto, user.sub);
  }

  @Get('question-bank/topics')
  listTopics(@Query() query: TopicQueryDto): Promise<Topic[]> {
    return this.bank.listTopics(query.courseId);
  }

  @Post('question-bank/topics')
  createTopic(@Body() dto: CreateTopicDto): Promise<Topic> {
    return this.bank.createTopic(dto);
  }

  @Delete('question-bank/topics/:id')
  @HttpCode(204)
  deleteTopic(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bank.deleteTopic(id);
  }

  @Get('question-bank/tags')
  listTags(@Query() query: TagQueryDto): Promise<TagCount[]> {
    return this.bank.listTags(query.search);
  }

  /** Add several READY bank questions to an exam (DRAFT/SCHEDULED only). */
  @Post('exams/:examId/questions/bulk')
  @HttpCode(200)
  bulkAdd(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: BulkAddToExamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkAddToExamResult> {
    return this.bank.bulkAddToExam(examId, dto.questionIds, user.sub);
  }
}
