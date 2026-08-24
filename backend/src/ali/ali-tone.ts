/**
 * ALI's tone progresses with the player's Journey stage (spec §4.4) —
 * a distinct axis from the stage's own name/color/title, so this lives
 * separately from journey-stages.ts rather than as another field bolted
 * onto JourneyStageDefinition.
 */
export function aliToneForJourneyStage(journeyStage: number): string {
  // journeyStage indexes: 0 forest, 1 hamlet, 2 village, 3 mountain,
  // 4 castle, 5 city, 6 town, 7 kingdom, 8 legend.
  if (journeyStage <= 0) return 'Warm, encouraging, lightly playful';
  if (journeyStage <= 2) return 'Friendly, playful, confidence-building';
  if (journeyStage <= 4) return 'Witty, more direct, encouraging challenge';
  // V22 §6 finding: "occasional sarcasm" sat in tension with the system
  // prompt's hard "never mock" guardrail, with no output-side check to
  // catch a drift into landing as mockery — reworded to keep the same
  // playful energy without that risk.
  if (journeyStage <= 6) return 'Confident, humorous, playful banter';
  if (journeyStage === 7) return 'Sharp, witty, prestigious companion';
  return 'Confident, legendary, playful challenge; never cruel';
}

export interface AliLearningSignals {
  currentStreak?: number | null;
  weaknessAreas?: string[] | null;
  currentDifficulty?: string | null;
}

/**
 * Short supplementary clauses layered on top of the Journey-stage tone.
 * The spec only mandates the stage progression (§4.4) for ALI's core
 * tone, so this stays a separate, additive input rather than changing
 * what aliToneForJourneyStage returns: the stored AliMessage.tone field
 * must keep meaning exactly "the Journey-stage tone at generation time"
 * for spec §4.6's versioning/history guarantee to hold, so these
 * modifiers only ever flow into the system prompt, never into the
 * persisted tone value.
 */
export function aliToneModifiers(signals: AliLearningSignals): string[] {
  const modifiers: string[] = [];
  if (signals.currentStreak && signals.currentStreak >= 7) {
    modifiers.push(
      `This player has a ${signals.currentStreak}-day streak going — acknowledge their consistency when it fits naturally, don't force it.`,
    );
  }
  if (signals.weaknessAreas && signals.weaknessAreas.length > 0) {
    modifiers.push(
      `This player is currently working through some weaker areas: ${signals.weaknessAreas.join(', ')}. Be encouraging about these, never critical.`,
    );
  }
  if (signals.currentDifficulty === 'ADVANCED') {
    modifiers.push(
      'This player is working at Advanced difficulty — treat mistakes as a normal part of that challenge level, not a setback.',
    );
  }
  return modifiers;
}
