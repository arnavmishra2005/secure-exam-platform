/**
 * Owner: Person C (Electron, Kiosk & Security)
 * Opening an exam in the exam app with a one-time launch token.
 */

import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateExamLaunchDto {
  @IsUUID('4')
  examId!: string;

  @IsUUID('4')
  captchaId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  captchaAnswer!: string;
}

/** 32 random bytes, base64url: always 43 characters. */
export class ExamLaunchTokenDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token is not valid' })
  token!: string;
}
