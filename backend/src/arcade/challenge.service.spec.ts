import { ArcadeChallengeService } from './challenge.service';

describe('ArcadeChallengeService.pickChallenges', () => {
  const makeWord = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    word: id,
    baseDifficulty: 'BEGINNER',
    ...overrides,
  });

  const prismaMock = {
    word: { findMany: jest.fn() },
  };
  const wordsServiceMock = {
    pickWordsForQuest: jest.fn(),
    recordGlobalExposure: jest.fn().mockResolvedValue(undefined),
  };

  let service: ArcadeChallengeService;

  beforeEach(() => {
    jest.clearAllMocks();
    wordsServiceMock.recordGlobalExposure.mockResolvedValue(undefined);
    service = new ArcadeChallengeService(prismaMock as any, wordsServiceMock as any);
  });

  it('with no filter, behaves exactly as a single fixed-size pick (unchanged for ScrambleQuest/Word Duel)', async () => {
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce(['a', 'b']);
    prismaMock.word.findMany.mockResolvedValueOnce([makeWord('a'), makeWord('b')]);

    const result = await service.pickChallenges('u1', 2, [], 5);

    expect(wordsServiceMock.pickWordsForQuest).toHaveBeenCalledTimes(1);
    expect(wordsServiceMock.pickWordsForQuest).toHaveBeenCalledWith('u1', 2, [], 5, undefined);
    expect(result.map((c) => c.word.id)).toEqual(['a', 'b']);
    expect(wordsServiceMock.recordGlobalExposure).toHaveBeenCalledWith(['a', 'b']);
  });

  it('over-fetches and backfills when a filter rejects some candidates, until the target count is reached', async () => {
    // First batch: 2 asked, 1 fails the filter.
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce(['good1', 'bad1']);
    prismaMock.word.findMany.mockResolvedValueOnce([makeWord('good1'), makeWord('bad1')]);
    // Backfill batch tops up the missing slot.
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce(['good2', 'bad2', 'good3']);
    prismaMock.word.findMany.mockResolvedValueOnce([
      makeWord('good2'),
      makeWord('bad2'),
      makeWord('good3'),
    ]);

    const isGood = (c: { word: { id: string } }) => c.word.id.startsWith('good');
    const result = await service.pickChallenges('u1', 2, [], undefined, undefined, isGood);

    expect(result.map((c) => c.word.id)).toEqual(['good1', 'good2']);
    // Backfill call excludes every word already seen, good and bad alike.
    expect(wordsServiceMock.pickWordsForQuest).toHaveBeenNthCalledWith(
      2,
      'u1',
      expect.any(Number),
      expect.arrayContaining(['good1', 'bad1']),
      undefined,
      undefined,
    );
  });

  it('records global exposure only for accepted challenges, never for ones the filter rejected', async () => {
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce(['good1', 'bad1']);
    prismaMock.word.findMany.mockResolvedValueOnce([makeWord('good1'), makeWord('bad1')]);
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce([]); // pool exhausted

    const isGood = (c: { word: { id: string } }) => c.word.id.startsWith('good');
    await service.pickChallenges('u1', 2, [], undefined, undefined, isGood);

    expect(wordsServiceMock.recordGlobalExposure).toHaveBeenCalledWith(['good1']);
  });

  it('stops retrying once the eligible pool is exhausted, returning fewer than requested', async () => {
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce(['bad1']);
    prismaMock.word.findMany.mockResolvedValueOnce([makeWord('bad1')]);
    // Pool has nothing left -- pickWordsForQuest returns [] on the next ask.
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce([]);

    const alwaysReject = () => false;
    const result = await service.pickChallenges('u1', 5, [], undefined, undefined, alwaysReject);

    expect(result).toEqual([]);
    expect(wordsServiceMock.recordGlobalExposure).not.toHaveBeenCalled();
    // Bounded retries -- didn't spin forever.
    expect(wordsServiceMock.pickWordsForQuest.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('returns an empty array without calling recordGlobalExposure when nothing is eligible at all', async () => {
    wordsServiceMock.pickWordsForQuest.mockResolvedValueOnce([]);

    const result = await service.pickChallenges('u1', 3);

    expect(result).toEqual([]);
    expect(wordsServiceMock.recordGlobalExposure).not.toHaveBeenCalled();
  });
});
