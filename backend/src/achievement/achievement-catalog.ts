export type AchievementCategory =
  'DISCOVERY' | 'MASTERY' | 'CONSISTENCY' | 'INDEPENDENT_LEARNING' | 'COMPETITION';

export interface AchievementCatalogEntry {
  /** Immutable, never renamed (spec §6.1) — this is the FK value AchievementUnlock.achievementId stores. */
  id: string;
  category: AchievementCategory;
  name: string;
  /** Player-facing description of the unlock condition. */
  description: string;
  /**
   * False for an achievement whose unlock condition depends on a
   * feature that doesn't exist in this codebase (e.g. monthly
   * leaderboard finalization). The catalog entry would still exist
   * with a real, permanent ID — spec §6.1's "immutable unique ID" and
   * "future rarity can be added without changing achievement IDs" both
   * imply the full v1.0 list is meant to exist from day one — but
   * AchievementService would never evaluate it; there's no real signal
   * to check it against, and fabricating one would be worse than
   * leaving it unreachable. Every entry below is currently `true` —
   * the V19 Stabilization Pass removed the 3 that referenced features
   * this codebase never had (a Speaking system, since fully removed;
   * a "Random/No-Hint" quest type this codebase has never had) rather
   * than leaving permanently-unreachable entries in the catalog. The
   * field stays part of the type for the next genuinely-not-built-yet
   * feature, not because anything today needs it.
   */
  checkable: boolean;
}

export const ACHIEVEMENT_REWARDS: Record<AchievementCategory, { xp: number; glyphs: number }> = {
  DISCOVERY: { xp: 25, glyphs: 1 },
  MASTERY: { xp: 50, glyphs: 2 },
  CONSISTENCY: { xp: 75, glyphs: 2 },
  INDEPENDENT_LEARNING: { xp: 75, glyphs: 2 },
  // V1 Final Systems Spec §8.7's explicit "Top 3 achievement: 5 Glyphs / 1,000 XP" — applied to the whole Competition category, matching this catalog's one-reward-per-category design.
  COMPETITION: { xp: 1000, glyphs: 5 },
};

export const ACHIEVEMENT_CATALOG: AchievementCatalogEntry[] = [
  // Discovery — total valid guesses (any ChallengeAttempt, any type)
  {
    id: 'first_step',
    category: 'DISCOVERY',
    name: 'First Step',
    description: 'Complete your first valid guess.',
    checkable: true,
  },
  {
    id: 'getting_started',
    category: 'DISCOVERY',
    name: 'Getting Started',
    description: 'Complete 10 valid guesses.',
    checkable: true,
  },
  {
    id: 'vocabulary_explorer',
    category: 'DISCOVERY',
    name: 'Vocabulary Explorer',
    description: 'Complete 100 valid guesses.',
    checkable: true,
  },

  // Mastery — masteredWordsCount thresholds
  {
    id: 'first_mastery',
    category: 'MASTERY',
    name: 'First Mastery',
    description: 'Master 1 word.',
    checkable: true,
  },
  {
    id: 'fivefold_mastery',
    category: 'MASTERY',
    name: 'Fivefold Mastery',
    description: 'Master 5 words.',
    checkable: true,
  },
  {
    id: 'vocabulary_builder',
    category: 'MASTERY',
    name: 'Vocabulary Builder',
    description: 'Master 50 words.',
    checkable: true,
  },
  {
    id: 'vocabulary_keeper',
    category: 'MASTERY',
    name: 'Vocabulary Keeper',
    description: 'Master 500 words.',
    checkable: true,
  },

  // Consistency — currentStreak thresholds
  {
    id: 'seven_strong',
    category: 'CONSISTENCY',
    name: 'Seven Strong',
    description: 'Maintain a 7-day activity streak.',
    checkable: true,
  },
  {
    id: 'tenacity',
    category: 'CONSISTENCY',
    name: 'Tenacity',
    description: 'Maintain a 10-day activity streak.',
    checkable: true,
  },
  {
    id: 'monthly_mindset',
    category: 'CONSISTENCY',
    name: 'Monthly Mindset',
    description: 'Maintain a 30-day activity streak.',
    checkable: true,
  },
  {
    id: 'unbroken',
    category: 'CONSISTENCY',
    name: 'Unbroken',
    description: 'Maintain a 60-day activity streak.',
    checkable: true,
  },
  {
    id: 'quarter_master',
    category: 'CONSISTENCY',
    name: 'Quarter Master',
    description: 'Maintain a 90-day activity streak.',
    checkable: true,
  },

  // Independent Learning — "independent" is checked against the real
  // per-attempt hintsUsed/synonymsUsed/lettersRevealed counters (see
  // AchievementService.checkIndependentLearning), not assumed by default.
  // The V19 Stabilization Pass removed 'random_independence' and
  // 'independent_master': both referenced a Random/No-Hint quest TYPE
  // this codebase has never had (quest types are Morning/Noon/Evening),
  // so they were permanently unreachable rather than merely unbuilt yet.
  {
    id: 'first_independent_quest',
    category: 'INDEPENDENT_LEARNING',
    name: 'First Independent Quest',
    description: 'Complete one eligible quest with no hints, synonyms, or non-free letter reveals.',
    checkable: true,
  },
  {
    id: 'independent_streak',
    category: 'INDEPENDENT_LEARNING',
    name: 'Independent Streak',
    description: 'Complete 3 consecutive eligible independent quests.',
    checkable: true,
  },
  {
    id: 'independent_ten',
    category: 'INDEPENDENT_LEARNING',
    name: 'Independent Ten',
    description: 'Complete 10 consecutive eligible independent quests.',
    checkable: true,
  },
  {
    id: 'independent_thirty',
    category: 'INDEPENDENT_LEARNING',
    name: 'Independent Thirty',
    description: 'Complete 30 consecutive eligible independent quests.',
    checkable: true,
  },

  // Competition
  {
    id: 'boss_champion',
    category: 'COMPETITION',
    name: 'Boss Champion',
    description: 'Win a Boss Battle.',
    checkable: true,
  },
  {
    id: 'boss_elite',
    category: 'COMPETITION',
    name: 'Boss Elite',
    description: 'Finish a Boss Battle in the top 3.',
    checkable: true,
  },
];
