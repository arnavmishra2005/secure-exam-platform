/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 */

import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SaveAnswerDto {
  /** Selected option id(s) for objective (single/multiple choice) questions. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedOptionIds?: string[];

  /** Free-text response for descriptive questions. */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  textResponse?: string;

  /**
   * "Mark for Review" toggle from the exam UI.
   *
   * Semantics: when PRESENT (true or false), explicitly sets the review
   * flag. When ABSENT, the answer's current review flag is PRESERVED.
   */
  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;

  /** "Clear Response" action — wipes selectedOptionIds/textResponse. */
  @IsOptional()
  @IsBoolean()
  clearResponse?: boolean;
}

export class SubmitAttemptDto {
  /**
   * Purely informational — the client's own clock when Submit was clicked.
   * NEVER used for expiry/authorization decisions; the server's own clock
   * and the attempt's persisted `expiresAt` are always authoritative.
   */
  @IsOptional()
  @IsString()
  clientSubmittedAt?: string;
}

/** Admin-only submissions list filter (GET /submissions). */
export class ListSubmissionsQueryDto {
  @IsOptional()
  @IsUUID('4')
  examId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * Admin manual score override (PATCH /submissions/:attemptId/result).
 *
 * Decimal scores are valid (partial-credit marking schemes are common),
 * capped at 2 decimal places. The `score <= result.maxScore` check
 * is enforced in SubmissionService#overrideScore.
 */
export class OverrideResultScoreDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Admin publish toggle (POST /submissions/:attemptId/result/publish). */
export class PublishResultDto {
  @IsOptional()
  @IsBoolean()
  publish?: boolean = true;
}
