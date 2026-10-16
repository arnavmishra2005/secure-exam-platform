import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { CodeRunResponse, JwtPayload } from '@secure-exam/types';
import { CodeRunDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CodeRunService } from './code-run.service';

/** Owner: Person B. Code execution during an attempt (owner only, attempt in progress). */
@ApiTags('coding')
@ApiBearerAuth()
@Controller('attempts/:attemptId/code')
export class CodeRunController {
  constructor(private readonly codeRunService: CodeRunService) {}

  /** Run against custom stdin or the sample tests. Waits for the result (a few seconds at most). */
  @Post('run')
  @HttpCode(200)
  @Roles(Role.STUDENT)
  run(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: CodeRunDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CodeRunResponse> {
    return this.codeRunService.run(attemptId, dto, user);
  }
}
