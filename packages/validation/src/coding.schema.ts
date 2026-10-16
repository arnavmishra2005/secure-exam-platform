/**
 * Owner: Person B
 */
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CODE_MAX_LENGTH, CODE_STDIN_MAX_LENGTH, CodeLanguage, CodeRunKind } from '@secure-exam/types';

/** POST /attempts/:attemptId/code/run */
export class CodeRunDto {
  @IsUUID('4')
  questionId!: string;

  @IsEnum(CodeLanguage)
  language!: CodeLanguage;

  @IsString()
  @MinLength(1)
  @MaxLength(CODE_MAX_LENGTH)
  code!: string;

  @IsEnum(CodeRunKind)
  kind!: CodeRunKind;

  /** Only used for kind = CUSTOM. */
  @IsOptional()
  @IsString()
  @MaxLength(CODE_STDIN_MAX_LENGTH)
  stdin?: string;
}

/** POST /attempts/:attemptId/code/submit — graded against all test cases. */
export class CodeSubmitDto {
  @IsUUID('4')
  questionId!: string;

  @IsEnum(CodeLanguage)
  language!: CodeLanguage;

  @IsString()
  @MinLength(1)
  @MaxLength(CODE_MAX_LENGTH)
  code!: string;
}
