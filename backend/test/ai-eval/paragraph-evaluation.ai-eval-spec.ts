import { ParagraphEvaluationService } from '../../src/paragraph/paragraph-evaluation.service';
import type { AppConfigService } from '../../src/config/config.service';

/**
 * Live-API quality check for the Paragraph stage (V1 Final Systems Spec
 * §3.5) — see test/ai-eval/README.md. Skips itself without a real
 * AI_PROVIDER_API_KEY.
 */
const hasLiveKey = Boolean(process.env.AI_PROVIDER_API_KEY);
const describeLive = hasLiveKey ? describe : describe.skip;

describeLive('ParagraphEvaluationService (live AI eval)', () => {
  jest.setTimeout(30_000);

  const fakeConfig = {
    isAiConfigured: true,
    aiApiKey: process.env.AI_PROVIDER_API_KEY,
    aiModel: process.env.AI_PROVIDER_MODEL ?? 'claude-sonnet-5',
  } as unknown as AppConfigService;

  const service = new ParagraphEvaluationService(fakeConfig);

  const WORD = 'resilient';
  const DEFINITION = 'able to withstand or recover quickly from difficult conditions';
  const PART_OF_SPEECH = 'adjective';

  const STRONG_PARAGRAPH =
    'After the factory closed, the small town seemed destined to fade away. But its residents ' +
    'proved remarkably resilient, opening new businesses, retraining for different careers, and ' +
    'supporting one another through the transition. Within a few years, the town had not only ' +
    'recovered but had built a more diverse economy than before, one that could better withstand ' +
    'future shocks.';

  const WEAK_PARAGRAPH =
    'the town resilient good after bad thing happen and people resilient work resilient every day ' +
    'for resilient the town again and everyone was resilient happy about it';

  it("does not destroy unrelated dimension scores over a single misused target word — spec's explicit requirement", async () => {
    // "resilient" grammatically misused (as if it meant "worked hard"),
    // but the surrounding paragraph is otherwise coherent and well
    // structured — vocabulary/context should suffer, structure/flow
    // should not collapse to near-zero alongside it.
    const result = await service.evaluate(
      WORD,
      DEFINITION,
      PART_OF_SPEECH,
      'The volunteers resilient every morning before dawn, sorting donations and loading trucks ' +
        'for the flood relief effort. Their coordinator kept a detailed schedule so nothing was ' +
        'missed, and by the end of the week the whole warehouse had been cleared and restocked.',
    );

    expect(result.scores.structure).toBeGreaterThan(40);
    expect(result.scores.flow).toBeGreaterThan(40);
  });

  it('scores a strong, coherent paragraph meaningfully higher than a repetitive, incoherent one', async () => {
    const strong = await service.evaluate(WORD, DEFINITION, PART_OF_SPEECH, STRONG_PARAGRAPH);
    const weak = await service.evaluate(WORD, DEFINITION, PART_OF_SPEECH, WEAK_PARAGRAPH);

    const strongAvg =
      Object.values(strong.scores).reduce((a, b) => a + b, 0) / Object.keys(strong.scores).length;
    const weakAvg =
      Object.values(weak.scores).reduce((a, b) => a + b, 0) / Object.keys(weak.scores).length;

    expect(strongAvg).toBeGreaterThan(weakAvg);
    expect(strong.xpAwarded).toBeGreaterThan(weak.xpAwarded);
  });

  it('returns a plausible CEFR-style proficiency label and well-formed feedback', async () => {
    const result = await service.evaluate(WORD, DEFINITION, PART_OF_SPEECH, STRONG_PARAGRAPH);

    // The prompt asks for exactly one of these six labels (see
    // buildSystemPrompt) — not pinned to a specific level, just the
    // contract.
    expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(result.estimatedProficiency);
    expect(result.whatWentWell.length).toBeGreaterThan(0);
    expect(result.whatNeedsImprovement.length).toBeGreaterThan(0);
    expect(result.nextAction.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
