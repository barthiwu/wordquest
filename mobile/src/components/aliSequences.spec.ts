import {
  ALI_SEQUENCE_IDS,
  ALI_SEQUENCES,
  isAliSequenceId,
  sequenceDurationMs,
  stepIndexAt,
} from './aliSequences';

// The popup lifetime the backend sends for each major event (ali-expression.ts).
// A sequence must fit inside it so the choreography never outlives its popup.
const BACKEND_DURATION_MS = {
  FIRST_ATTEMPT_MASTERY: 4500,
  MASTERY_AFTER_STRUGGLE: 3500,
  LEVEL_UP: 4500,
  JOURNEY_TRANSITION: 6000,
  BOSS_VICTORY: 4500,
  BOSS_DEFEAT: 3200,
} as const;

describe('aliSequences', () => {
  it('defines the six Bible §7 sequences', () => {
    expect([...ALI_SEQUENCE_IDS].sort()).toEqual(Object.keys(BACKEND_DURATION_MS).sort());
  });

  it.each(ALI_SEQUENCE_IDS)('%s fits inside its popup duration and has valid beats', (id) => {
    const seq = ALI_SEQUENCES[id];
    expect(seq.id).toBe(id);
    expect(sequenceDurationMs(id)).toBeLessThanOrEqual(BACKEND_DURATION_MS[id]);
    expect(seq.steps.length).toBeGreaterThanOrEqual(3);
    seq.steps.forEach((s) => {
      expect(s.holdMs).toBeGreaterThan(0);
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(5);
    });
    expect(seq.stillStep).toBeGreaterThanOrEqual(0);
    expect(seq.stillStep).toBeLessThan(seq.steps.length);
  });

  it('uses the Bible §10 priorities: Journey 5, level-up and first-attempt mastery 4, the rest below', () => {
    expect(ALI_SEQUENCES.JOURNEY_TRANSITION.priority).toBe(5);
    expect(ALI_SEQUENCES.LEVEL_UP.priority).toBe(4);
    expect(ALI_SEQUENCES.FIRST_ATTEMPT_MASTERY.priority).toBe(4);
    expect(ALI_SEQUENCES.MASTERY_AFTER_STRUGGLE.priority).toBe(3);
  });

  it('never shames on a Boss defeat: low intensity, no triumphant/proud beats', () => {
    ALI_SEQUENCES.BOSS_DEFEAT.steps.forEach((s) => {
      expect(s.intensity).toBeLessThanOrEqual(2);
      expect(['TRIUMPHANT', 'PROUD', 'MISCHIEVOUS']).not.toContain(s.expression);
    });
  });

  it('finds the playing beat by elapsed time and holds the last one', () => {
    const first = ALI_SEQUENCES.LEVEL_UP.steps[0].holdMs;
    expect(stepIndexAt('LEVEL_UP', 0)).toBe(0);
    expect(stepIndexAt('LEVEL_UP', first - 1)).toBe(0);
    expect(stepIndexAt('LEVEL_UP', first)).toBe(1);
    expect(stepIndexAt('LEVEL_UP', 999999)).toBe(ALI_SEQUENCES.LEVEL_UP.steps.length - 1);
  });

  it('recognises sequence ids', () => {
    expect(isAliSequenceId('LEVEL_UP')).toBe(true);
    expect(isAliSequenceId('NOPE')).toBe(false);
    expect(isAliSequenceId(undefined)).toBe(false);
  });
});
