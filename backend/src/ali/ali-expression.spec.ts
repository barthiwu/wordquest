import { aliExpressionForEvent, quickAliExpression } from './ali-expression';

describe('quickAliExpression', () => {
  it('returns a fixed pleased cue for a correct guess', () => {
    const cue = quickAliExpression(true);
    expect(cue).toEqual({
      expression: 'PLEASED',
      pose: 'HEAD_TILT',
      intensity: 1,
      priority: 1,
      durationMs: 2800,
    });
  });

  it('returns a fixed encouraging cue for a wrong guess', () => {
    const cue = quickAliExpression(false);
    expect(cue.expression).toBe('ENCOURAGING');
    expect(cue.priority).toBe(1);
  });
});

describe('aliExpressionForEvent', () => {
  it('gives JOURNEY_COMPLETION the top cinematic tier and priority', () => {
    const cue = aliExpressionForEvent('JOURNEY_COMPLETION', {});
    expect(cue.intensity).toBe(5);
    expect(cue.priority).toBe(5);
    expect(cue.expression).toBe('TRIUMPHANT');
  });

  it('gives LEVEL_UP a major (4) tier and priority', () => {
    const cue = aliExpressionForEvent('LEVEL_UP', { newLevel: 12 });
    expect(cue.intensity).toBe(4);
    expect(cue.priority).toBe(4);
  });

  describe('MASTERY_EVENT', () => {
    it('is priority/intensity 4 with a celebratory-hop pose on a first-attempt mastery', () => {
      const cue = aliExpressionForEvent('MASTERY_EVENT', {
        wordMastered: 'resilient',
        totalMastered: 51,
        firstAttempt: true,
      });
      expect(cue.priority).toBe(4);
      expect(cue.intensity).toBe(4);
      expect(cue.pose).toBe('CELEBRATORY_HOP');
    });

    it('is priority/intensity 3 on a mastery-after-struggle', () => {
      const cue = aliExpressionForEvent('MASTERY_EVENT', {
        wordMastered: 'resilient',
        totalMastered: 51,
        firstAttempt: false,
      });
      expect(cue.priority).toBe(3);
      expect(cue.intensity).toBe(3);
    });

    it('treats a missing firstAttempt flag as mastery-after-struggle (safe default)', () => {
      const cue = aliExpressionForEvent('MASTERY_EVENT', { wordMastered: 'x', totalMastered: 1 });
      expect(cue.priority).toBe(3);
    });
  });

  describe('BOSS_BATTLE_RESULT', () => {
    it('is triumphant at priority 4 for rank 1', () => {
      const cue = aliExpressionForEvent('BOSS_BATTLE_RESULT', {
        rank: 1,
        groupSize: 12,
        battleXp: 400,
      });
      expect(cue.expression).toBe('TRIUMPHANT');
      expect(cue.priority).toBe(4);
    });

    it('is a gentle CONCERNED cue at priority 2 for a non-win rank', () => {
      const cue = aliExpressionForEvent('BOSS_BATTLE_RESULT', {
        rank: 8,
        groupSize: 12,
        battleXp: 40,
      });
      expect(cue.expression).toBe('CONCERNED');
      expect(cue.priority).toBe(2);
    });
  });

  describe('ACHIEVEMENT_UNLOCK / STREAK_MILESTONE', () => {
    it('both land in the priority-3 "mastery/achievement/streak" bucket', () => {
      expect(aliExpressionForEvent('ACHIEVEMENT_UNLOCK', {}).priority).toBe(3);
      expect(aliExpressionForEvent('STREAK_MILESTONE', { streakDays: 30 }).priority).toBe(3);
    });
  });

  describe('QUEST_COMPLETION', () => {
    it('is a stronger PLEASED cue on a perfect run', () => {
      const cue = aliExpressionForEvent('QUEST_COMPLETION', {
        word: 'resilient',
        correctCount: 3,
        totalCount: 3,
      });
      expect(cue.expression).toBe('PLEASED');
      expect(cue.priority).toBe(2);
    });

    it('is a softer ENCOURAGING cue on an imperfect run', () => {
      const cue = aliExpressionForEvent('QUEST_COMPLETION', {
        word: 'resilient',
        correctCount: 1,
        totalCount: 3,
      });
      expect(cue.expression).toBe('ENCOURAGING');
      expect(cue.priority).toBe(1);
    });

    it('falls back to the softer cue when counts are absent from context', () => {
      const cue = aliExpressionForEvent('QUEST_COMPLETION', { word: 'resilient' });
      expect(cue.expression).toBe('ENCOURAGING');
    });
  });

  describe('ORDER_SELECTION', () => {
    it('is a bigger cue on a first-ever selection', () => {
      expect(aliExpressionForEvent('ORDER_SELECTION', { isFirstSelection: true }).priority).toBe(2);
      expect(aliExpressionForEvent('ORDER_SELECTION', { isFirstSelection: false }).priority).toBe(
        1,
      );
    });
  });

  describe('on-demand tutor events', () => {
    it('never carry a timed pop-up duration (rendered inline by the caller)', () => {
      expect(aliExpressionForEvent('MISTAKE_EXPLANATION', {}).durationMs).toBe(0);
      expect(aliExpressionForEvent('VOCABULARY_ALTERNATIVES', {}).durationMs).toBe(0);
      expect(aliExpressionForEvent('WRITING_FEEDBACK', {}).durationMs).toBe(0);
      expect(aliExpressionForEvent('FORGETTING_CURVE_REMINDER', {}).durationMs).toBe(0);
    });
  });
});
