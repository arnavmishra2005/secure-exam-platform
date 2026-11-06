/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 */

import { CourseStaffRole, Permission } from '@secure-exam/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
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

/** POST /courses/:id/staff — add an instructor or TA to a course (instructors only). */
export class AddCourseStaffDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Required when the email has no account yet (a new TA is created). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName?: string;

  /** Required when the email has no account yet. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsEnum(CourseStaffRole)
  role!: CourseStaffRole;

  /** TAs only. Defaults to DEFAULT_TA_PERMISSIONS. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];
}

/** PATCH /courses/:id/staff/:userId — change a TA's permissions (instructors only). */
export class UpdateCourseStaffDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  permissions!: Permission[];
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
