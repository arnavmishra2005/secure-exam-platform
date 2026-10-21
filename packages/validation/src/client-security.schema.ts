/**
 * Owner: Person C (Electron, Kiosk & Security)
 * POST /attempts/:attemptId/events : security events from the exam app.
 */

import { DESKTOP_VIOLATION_TYPES } from '@secure-exam/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SecurityEventItemDto {
  @IsIn([...DESKTOP_VIOLATION_TYPES])
  type!: (typeof DESKTOP_VIOLATION_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  detail?: string;

  @IsDateString()
  occurredAt!: string;
}

export class ReportSecurityEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SecurityEventItemDto)
  events!: SecurityEventItemDto[];
}
