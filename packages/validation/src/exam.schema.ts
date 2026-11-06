/**
 * Owner: Person B
 * Tech choice: class-validator + class-transformer (pairs with NestJS's
 * global ValidationPipe, which Person A configures in main.ts).
 */
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsUUID,
  Max,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsBeforeEndTime', async: false })
class IsBeforeEndTimeConstraint implements ValidatorConstraintInterface {
  validate(startTime: string, args: ValidationArguments) {
    const obj = args.object as CreateExamDto;
    if (!startTime || !obj.endTime) return true; // let @IsDateString handle missing fields
    return new Date(startTime).getTime() < new Date(obj.endTime).getTime();
  }
  defaultMessage() {
    return 'startTime must be earlier than endTime';
  }
}

export class CreateExamDto {
  /** Person A: the owning course. Its instructors and TAs manage the exam. */
  @IsUUID('4')
  courseId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsDateString()
  @Validate(IsBeforeEndTimeConstraint)
  startTime!: string;

  @IsDateString()
  endTime!: string;

  /** Person A (publish): pass mark as a percentage of the maximum score. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passPercentage?: number;

  /** Person A: false = no pass mark, so no pass/fail and no pass rate. */
  @IsOptional()
  @IsBoolean()
  passMarkEnabled?: boolean;
}

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passPercentage?: number;

  @IsOptional()
  @IsBoolean()
  passMarkEnabled?: boolean;
}

/**
 * Person A: POST /exams/:id/reschedule. The service decides which fields may
 * change in the exam's current state.
 */
export class RescheduleExamDto {
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignStudentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}
