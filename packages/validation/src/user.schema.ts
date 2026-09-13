// Owner: Person A (Identity/Auth/Security)

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateStudentDto {
  @IsString()
  collegeId!: string;

  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string; // if omitted, a temp password is generated
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkImportStudentsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  @ArrayMinSize(1)
  students!: CreateStudentDto[];
}
