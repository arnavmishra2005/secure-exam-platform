/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 */

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'code may contain only letters, digits, ".", "_" and "-"' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'code may contain only letters, digits, ".", "_" and "-"' })
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class EnrollStudentsDto {
  /** students.id values or college IDs. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentIds!: string[];
}

export class AssignExamToCourseDto {
  @IsUUID('4')
  courseId!: string;
}

export class PublishExamDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passPercentage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
