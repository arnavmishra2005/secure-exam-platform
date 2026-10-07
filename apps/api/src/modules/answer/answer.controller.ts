import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { SaveAnswerDto } from '@secure-exam/validation';
import { AnswerService } from './answer.service';

@ApiTags('answers')
@ApiBearerAuth()
@Controller('attempts/:attemptId/answers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnswerController {
  constructor(private readonly answerService: AnswerService) {}

  @Put(':questionId')
  @Roles(Role.STUDENT)
  save(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.answerService.saveAnswer(attemptId, questionId, dto, user);
  }

  @Get()
  @Roles(Role.STUDENT, Role.ADMIN)
  listForAttempt(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentUser() user: JwtPayload) {
    return this.answerService.listForAttempt(attemptId, user);
  }
}

@ApiTags('answers')
@ApiBearerAuth()
@Controller('attempts/:attemptId/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttemptQuestionController {
  constructor(private readonly answerService: AnswerService) {}

  /** The student's exam questions for this attempt, without the answer key. */
  @Get()
  @Roles(Role.STUDENT)
  list(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentUser() user: JwtPayload) {
    return this.answerService.listQuestionsForAttempt(attemptId, user);
  }
}
