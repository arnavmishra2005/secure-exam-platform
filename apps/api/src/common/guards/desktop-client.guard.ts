// Exams are taken in the exam app only. The browser keeps the dashboard, the
// results and the admin portal, but cannot start an attempt, fetch its
// questions, save answers or submit. The exam app tags every API request with
// X-Client-Type: DESKTOP (see apps/exam-client/src/main/main.ts).
//
// The header is advisory against a determined cheater (anyone can send it), but
// it stops the ordinary mistake of sitting an exam in a normal browser tab. The
// real barrier is the OS kiosk session; see docs/kiosk-integration.md.
// REQUIRE_DESKTOP_CLIENT=false switches the rule off for development.

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DesktopClientGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.config.get<boolean | string>('REQUIRE_DESKTOP_CLIENT');
    if (required === false || required === 'false') return true;
    const request = context.switchToHttp().getRequest<{ header(name: string): string | undefined }>();
    if (request.header('x-client-type')?.toUpperCase() === 'DESKTOP') return true;
    throw new ForbiddenException('This exam can only be taken in the Secure Exam app. Open it from your dashboard.');
  }
}
