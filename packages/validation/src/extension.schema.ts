/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ExtendTimeDto {
  /** Whole minutes to add. Capped at 8 hours to catch typos. */
  @IsInt()
  @Min(1)
  @Max(480)
  minutes!: number;

  /** users.id or students.id of one student; omit to extend the whole exam. */
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
