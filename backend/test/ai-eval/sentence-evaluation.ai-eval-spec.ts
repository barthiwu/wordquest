import { SentenceEvaluationService } from '../../src/sentence/sentence-evaluation.service';
import type { AppConfigService } from '../../src/config/config.service';

/**
 * Live-API quality check for the Sentence stage (V1 Final Systems Spec
 * §3.4) — see test/ai-eval/README.md for what this is and why it's
 * separate from the mocked unit tests. Skips itself entirely without a
 * real AI_PROVIDER_API_KEY, so it never runs in normal `npm test`/CI.
 */
const hasLiveKey = Boolean(process.env.AI_PROVIDER_API_KEY);
const describeLive = hasLiveKey ? describe : describe.skip;

describeLive('SentenceEvaluationService (live AI eval)', () => {
  jest.setTimeout(30_000);

  const fakeConfig = {
    isAiConfigured: true,
    aiApiKey: process.env.AI_PROVIDER_API_KEY,
    aiModel: process.env.AI_PROVIDER_MODEL ?? 'claude-sonnet-5',
  } as unknown as AppConfigService;

  const service = new SentenceEvaluationService(fakeConfig);

  const WORD = 'meticulous';
  const DEFINITION = 'showing great attention to detail; very careful and precise';
  const PART_OF_SPEECH = 'adjective';

  it('scores a strong, natural sentence meaningfully higher than a broken one', async () => {
    const strong = await service.evaluate(
      WORD,
      DEFINITION,
      PART_OF_SPEECH,
      'She kept meticulous records of every transaction, double-checking each entry before filing it away.',
    );
    const weak = await service.evaluate(
      WORD,
      DEFINITION,
      PART_OF_SPEECH,
      'meticulous house go fast very',
    );

    const strongAvg =
      Object.values(strong.scores).reduce((a, b) => a + b, 0) / Object.keys(strong.scores).length;
    const weakAvg =
      Object.values(weak.scores).reduce((a, b) => a + b, 0) / Object.keys(weak.scores).length;

    expect(strongAvg).toBeGreaterThan(weakAvg);
    expect(strong.xpAwarded).toBeGreaterThan(weak.xpAwarded);
  });

  it('rejects — via low vocabulary score, not a thrown error — a sentence that uses the word with the wrong meaning', async () => {
    // "meticulous" misused as if it meant "fast" — grammar/naturalness
    // can still look fine; vocabulary specifically should suffer.
    const result = await service.evaluate(
      WORD,
      DEFINITION,
      PART_OF_SPEECH,
      'He ran so meticulous that he won the race by a mile.',
    );
    expect(result.scores.vocabulary).toBeLessThan(60);
  });

  it('returns well-formed, non-generic feedback for every response', async () => {
    const result = await service.evaluate(
      WORD,
      DEFINITION,
      PART_OF_SPEECH,
      'The librarian meticulously catalogued each rare manuscript by hand.',
    );

    for (const dim of ['grammar', 'vocabulary', 'context', 'naturalness', 'clarity'] as const) {
      expect(result.scores[dim]).toBeGreaterThanOrEqual(0);
      expect(result.scores[dim]).toBeLessThanOrEqual(100);
    }
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.whatWentWell.length).toBeGreaterThan(0);
    expect(result.whatNeedsImprovement.length).toBeGreaterThan(0);
    expect(result.nextAction.length).toBeGreaterThan(0);
  });
});
