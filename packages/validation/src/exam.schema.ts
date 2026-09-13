/**
 * Owner: Person B
 * Tech choice: class-validator + class-transformer (pairs with NestJS's
 * global ValidationPipe, which Person A configures in main.ts).
 */
import {
  IsDateString,
  IsInt,
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
}

export class AssignStudentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}
