/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 *
 * Uses class-validator + class-transformer (pairs naturally with NestJS
 * pipes, per the file-structure doc).
 */

import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttemptStatus } from '@secure-exam/types';

export class StartAttemptDto {
  @IsUUID('4', { message: 'examId must be a valid UUID' })
  examId!: string;
}

/** Admin-only monitoring list filter (GET /attempts). */
export class ListAttemptsQueryDto {
  @IsOptional()
  @IsUUID('4')
  examId?: string;

  @IsOptional()
  @IsEnum(AttemptStatus)
  status?: AttemptStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
