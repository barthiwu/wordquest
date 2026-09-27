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
