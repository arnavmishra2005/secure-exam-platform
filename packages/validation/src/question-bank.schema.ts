/**
 * Owner: Person B (question bank). Admin-only request bodies and queries.
 */
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CODE_MAX_LENGTH,
  OutputComparisonMode,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '@secure-exam/types';
import type { StarterCode } from '@secure-exam/types';
import { CreateOptionDto } from './question.schema';

/** Limits shared with the service's own checks. */
export const BANK_LIMITS = {
  textMax: 5000,
  statementMax: 20_000,
  testsMax: 50,
  testIoMax: 100_000,
  tagsMax: 20,
  tagMax: 50,
  marksMax: 1000,
} as const;

const toOptionalNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

/** GET /question-bank/questions */
export class BankQuestionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  courseId?: string;

  @IsOptional()
  @IsUUID('4')
  topicId?: string;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(BANK_LIMITS.tagMax)
  tag?: string;

  @IsOptional()
  @IsUUID('4')
  excludeExamId?: string;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CodingTestCaseInputDto {
  @IsString()
  @MaxLength(BANK_LIMITS.testIoMax)
  input!: string;

  @IsString()
  @MaxLength(BANK_LIMITS.testIoMax)
  expectedOutput!: string;

  @IsBoolean()
  isSample!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;
}

export class CodingProblemInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(BANK_LIMITS.statementMax)
  statementMd!: string;

  /** `{ python: "..." }`; values are checked in the service. */
  @IsOptional()
  @IsObject()
  starterCode?: StarterCode;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10_000)
  timeLimitMs?: number;

  @IsOptional()
  @IsInt()
  @Min(32)
  @Max(512)
  memoryLimitMb?: number;

  @IsOptional()
  @IsEnum(OutputComparisonMode)
  comparisonMode?: OutputComparisonMode;

  @IsOptional()
  @IsString()
  @MaxLength(CODE_MAX_LENGTH)
  referenceSolution?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'A coding question needs at least one test case' })
  @ArrayMaxSize(BANK_LIMITS.testsMax)
  @ValidateNested({ each: true })
  @Type(() => CodingTestCaseInputDto)
  tests!: CodingTestCaseInputDto[];
}

/** Shared by metadata-only updates and full saves. */
class BankMetaFields {
  @IsOptional()
  @IsUUID('4')
  courseId?: string | null;

  @IsOptional()
  @IsUUID('4')
  topicId?: string | null;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty | null;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BANK_LIMITS.tagsMax)
  @IsString({ each: true })
  @Length(1, BANK_LIMITS.tagMax, { each: true })
  tags?: string[];
}

/** POST /question-bank/questions and PUT /question-bank/questions/:id */
export class SaveBankQuestionDto extends BankMetaFields {
  @IsString()
  @IsNotEmpty()
  @MaxLength(BANK_LIMITS.textMax)
  text!: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsNumber()
  @Min(0)
  @Max(BANK_LIMITS.marksMax)
  marks!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  negativeMarks?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(BANK_LIMITS.textMax)
  explanation?: string | null;

  /** Required for MCQ / TRUE_FALSE; must be absent or empty for CODING. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];

  /** Required for CODING; must be absent otherwise. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CodingProblemInputDto)
  coding?: CodingProblemInputDto;
}

/** PATCH /question-bank/questions/:id/meta */
export class UpdateBankQuestionMetaDto extends BankMetaFields {}

/** POST /question-bank/topics */
export class CreateTopicDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID('4')
  courseId?: string | null;
}

/** GET /question-bank/topics */
export class TopicQueryDto {
  @IsOptional()
  @IsUUID('4')
  courseId?: string;
}

/** GET /question-bank/tags */
export class TagQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(BANK_LIMITS.tagMax)
  search?: string;
}

/** POST /exams/:examId/questions/bulk */
export class BulkAddToExamDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  questionIds!: string[];
}
