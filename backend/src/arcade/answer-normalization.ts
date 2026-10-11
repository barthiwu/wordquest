/**
 * Shared answer-normalization rule for every Arcade game (and the same
 * rule QuestsService already uses for Daily Quest answers) — case-
 * insensitive, whitespace-collapsed comparison. Centralized here so
 * ScrambleQuest, Complete It, and Word Duel all treat "Train", " train ",
 * and "train" as the same submission, consistently.
 */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The player's own submission, echoed back in the answer result so every
 * game can show them exactly what they wrote beside the right answer.
 * Whitespace-trimmed and capped; never altered otherwise (case included). */
export function echoSubmittedAnswer(value: string): string {
  return value.trim().slice(0, 60);
}
