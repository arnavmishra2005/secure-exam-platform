import { CodeLanguage, OutputComparisonMode } from '@secure-exam/types';
import { CodingContentService } from './coding-content.service';

describe('CodingContentService.getPublicProblems', () => {
  const problem = {
    questionId: 'q1',
    statementMd: 'Add two numbers',
    starterCode: { python: '# start' },
    allowedLanguages: [CodeLanguage.PYTHON],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    comparisonMode: OutputComparisonMode.TRIM,
    referenceSolution: 'print(SECRET)',
  };

  function setup() {
    const problemRepo = { find: jest.fn().mockResolvedValue([problem]) };
    const testCaseRepo = {
      find: jest.fn().mockResolvedValue([
        { questionId: 'q1', input: '1 2', expectedOutput: '3', isSample: true, weight: 1 },
      ]),
    };
    return {
      service: new CodingContentService(problemRepo as never, testCaseRepo as never),
      testCaseRepo,
    };
  }

  it('returns statement, starter code, limits and samples only', async () => {
    const { service, testCaseRepo } = setup();
    const map = await service.getPublicProblems(['q1', 'q2']);

    expect(testCaseRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isSample: true }) }),
    );
    expect(map.get('q1')).toEqual({
      statementMd: 'Add two numbers',
      starterCode: { python: '# start' },
      allowedLanguages: [CodeLanguage.PYTHON],
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      samples: [{ index: 1, input: '1 2', expectedOutput: '3' }],
    });
    expect(map.has('q2')).toBe(false);
    expect(JSON.stringify([...map.values()])).not.toContain('SECRET');
  });

  it('skips the queries for an empty list', async () => {
    const { service, testCaseRepo } = setup();
    expect((await service.getPublicProblems([])).size).toBe(0);
    expect(testCaseRepo.find).not.toHaveBeenCalled();
  });
});
