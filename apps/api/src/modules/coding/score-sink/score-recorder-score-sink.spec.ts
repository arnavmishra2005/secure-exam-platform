import { ScoreSource } from '@secure-exam/types';
import { ScoreRecorderCodeScoreSink } from './score-recorder-score-sink';

describe('ScoreRecorderCodeScoreSink', () => {
  const base = { attemptId: 'a1', examId: 'e1', questionId: 'q1', studentId: 'u1' };

  function setup() {
    const scores = { record: jest.fn().mockResolvedValue(undefined), recordMany: jest.fn() };
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = { getRepository: jest.fn().mockReturnValue({ update }) };
    return { sink: new ScoreRecorderCodeScoreSink(scores as never), scores, manager, update };
  }

  it('records the code score as AUTO_CODE inside the grading transaction', async () => {
    const { sink, scores, manager } = setup();

    await sink.record(manager as never, { ...base, score: 6, maxScore: 10 });

    expect(scores.record).toHaveBeenCalledWith(
      { attemptId: 'a1', questionId: 'q1', source: ScoreSource.AUTO_CODE, score: 6, maxScore: 10, isCorrect: false },
      manager,
    );
  });

  it('marks a full-marks submission as correct', async () => {
    const { sink, scores, manager } = setup();

    await sink.record(manager as never, { ...base, score: 10, maxScore: 10 });

    expect(scores.record).toHaveBeenCalledWith(expect.objectContaining({ isCorrect: true }), manager);
  });

  it('replaces the result totals outright', async () => {
    const { sink, manager, update } = setup();

    await sink.replaceTotals(manager as never, 'a1', 12.5, 20);

    expect(update).toHaveBeenCalledWith({ attemptId: 'a1' }, { score: 12.5, maxScore: 20 });
  });

  it('fails when the attempt has no result row', async () => {
    const { sink, manager, update } = setup();
    update.mockResolvedValue({ affected: 0 });

    await expect(sink.replaceTotals(manager as never, 'a1', 1, 2)).rejects.toThrow('No result row');
  });
});
