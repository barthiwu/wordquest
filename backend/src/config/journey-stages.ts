/**
 * Journey stage ladder — Final Core Progression Specification v1.0
 * §2/§3.3, the authoritative source of truth ("Where earlier Founder's
 * Archive material conflicts with this document, this specification
 * takes precedence" — an earlier pass in this codebase had Journey
 * driven by mastered words alone; that's corrected here to the real
 * dual gate).
 *
 * A destination Journey unlocks only when BOTH are true (§2.2):
 *   - player's Level >= the stage's minLevel
 *   - player's masteredWordsCount >= the stage's requiredMasteredWords
 * Journey and Level are deliberately separate systems (§1) — Level
 * alone never changes the primary Journey title, and vice versa.
 */
export interface JourneyStageDefinition {
  stage: number; // 0-indexed, matches UserProgression.journeyStage
  key: string;
  name: string;
  /** §2.1's "Primary Title" — the player-facing identity title for this stage, e.g. "The Seeker". */
  primaryTitle: string;
  minLevel: number;
  requiredMasteredWords: number;
  /** §2.1/§2.5's "Identity Theme" / "Colour Identity" — every stage has one now (an earlier pass here left 4 of these null; the Founder's Archive document that would have supplied them turned out to just be this one). */
  colorIdentity: string;
  /** §2.1's "Major Unlock" column — the stage-specific feature this Journey grants, in addition to its color identity. */
  majorUnlock: string;
}

export const JOURNEY_STAGES: JourneyStageDefinition[] = [
  {
    stage: 0,
    key: 'forest',
    name: 'Forest',
    primaryTitle: 'The Seeker',
    minLevel: 1,
    requiredMasteredWords: 0,
    colorIdentity: 'Neutral / Black',
    majorUnlock: 'Core profile',
  },
  {
    stage: 1,
    key: 'hamlet',
    name: 'Hamlet',
    primaryTitle: 'The Apprentice',
    minLevel: 6,
    requiredMasteredWords: 50,
    colorIdentity: 'Green',
    majorUnlock: 'Expanded basic identity',
  },
  {
    stage: 2,
    key: 'village',
    name: 'Village',
    primaryTitle: 'The Scholar',
    minLevel: 11,
    requiredMasteredWords: 100,
    colorIdentity: 'Warm Earth',
    majorUnlock: 'Expanded cosmetics',
  },
  {
    stage: 3,
    key: 'mountain',
    name: 'Mountain',
    primaryTitle: 'The Climber',
    minLevel: 21,
    requiredMasteredWords: 200,
    colorIdentity: 'Blue',
    majorUnlock: 'Achievement showcase',
  },
  {
    stage: 4,
    key: 'castle',
    name: 'Castle',
    primaryTitle: 'The Keeper',
    minLevel: 31,
    requiredMasteredWords: 400,
    colorIdentity: 'Royal Red',
    majorUnlock: 'Country flag / Castle identity',
  },
  {
    stage: 5,
    key: 'city',
    name: 'City',
    primaryTitle: 'The Sage',
    minLevel: 41,
    requiredMasteredWords: 800,
    colorIdentity: 'Gold',
    majorUnlock: 'CEFR eligibility gate',
  },
  {
    stage: 6,
    key: 'town',
    name: 'Town',
    primaryTitle: 'The Mentor',
    minLevel: 51,
    requiredMasteredWords: 1600,
    colorIdentity: 'Violet',
    majorUnlock: 'Expanded Quest Card identity',
  },
  {
    stage: 7,
    key: 'kingdom',
    name: 'Kingdom',
    primaryTitle: 'The Luminary',
    minLevel: 71,
    requiredMasteredWords: 3200,
    colorIdentity: 'Deep Royal',
    majorUnlock: 'The Order selection',
  },
  {
    stage: 8,
    key: 'legend',
    name: 'Legend',
    primaryTitle: 'The Word Legend',
    minLevel: 91,
    requiredMasteredWords: 6400,
    colorIdentity: 'Celestial',
    majorUnlock: 'Legendary profile effects',
  },
];

/** The CEFR gate (§2.4) checks "City reached" by this key, never by a numeric stage index. */
export const CITY_STAGE_KEY = 'city';
/** The Order (§5.4) unlocks at this stage. */
export const KINGDOM_STAGE_KEY = 'kingdom';

/**
 * The highest stage whose dual gate (Level AND mastered words) is
 * satisfied — §8's edge cases are explicit that meeting only ONE side
 * of the gate must leave Journey unchanged, so this never advances a
 * stage on a partial match.
 */
export function journeyStageForProgress(level: number, masteredWordsCount: number): number {
  let stage = JOURNEY_STAGES[0].stage;
  for (const def of JOURNEY_STAGES) {
    if (level >= def.minLevel && masteredWordsCount >= def.requiredMasteredWords) {
      stage = def.stage;
    }
  }
  return stage;
}

export function hasReachedCityStage(journeyStage: number): boolean {
  const cityStage = JOURNEY_STAGES.find((s) => s.key === CITY_STAGE_KEY)!;
  return journeyStage >= cityStage.stage;
}

export function hasReachedKingdomStage(journeyStage: number): boolean {
  const kingdomStage = JOURNEY_STAGES.find((s) => s.key === KINGDOM_STAGE_KEY)!;
  return journeyStage >= kingdomStage.stage;
}

/**
 * Quest Card rarity for a journey-stage-completion card (V1 Remaining
 * Systems Spec §12/§18) — later stages are rarer, matching how much
 * harder they are to reach (§2's escalating minLevel/requiredMasteredWords
 * gates). Not stored in JOURNEY_STAGES itself since rarity is a Quest
 * Card presentation concern, not a property of the stage.
 */
export function questCardRarityForStage(stage: number): 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
  if (stage >= 8) return 'LEGENDARY';
  if (stage >= 6) return 'EPIC';
  if (stage >= 3) return 'RARE';
  return 'COMMON';
}
