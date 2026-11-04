import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission, type JwtPayload, type RecalculateResponse } from '@secure-exam/types';
import { RecalculateDto } from '@secure-exam/validation';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResultRecalculationService } from './result-recalculation.service';

/** Owner: Person B. Staff: re-score an exam after its questions were edited. */
@ApiTags('question-analytics')
@ApiBearerAuth()
@Controller('exams/:examId/question-analytics')
@RequirePermission(Permission.MARKS_ADJUST, { exam: 'examId' })
export class ResultRecalculationController {
  constructor(private readonly recalculation: ResultRecalculationService) {}

  /** Whole exam, or one question with `{ questionId }`. Replaces manual score overrides of finished attempts. */
  @Post('recalculate')
  @HttpCode(200)
  recalculate(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: RecalculateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecalculateResponse> {
    return this.recalculation.recalculate(examId, dto.questionId, user.sub);
  }
}
