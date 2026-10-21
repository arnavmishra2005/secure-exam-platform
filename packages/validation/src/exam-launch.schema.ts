/**
 * Owner: Person C (Electron, Kiosk & Security)
 * Opening an exam in the exam app with a one-time launch token.
 */

import { IsUUID, Matches } from 'class-validator';

export class CreateExamLaunchDto {
  @IsUUID('4')
  examId!: string;
}

/** 32 random bytes, base64url: always 43 characters. */
export class ExamLaunchTokenDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token is not valid' })
  token!: string;
}
