import { Injectable } from '@nestjs/common';
import { WordDifficulty } from '@prisma/client';
import {
  ARCADE_BASE_XP,
  hintModifierFor,
  speedModifierFor,
  streakModifierFor,
} from './config/arcade.config';

export interface RewardCalculationInput {
  difficulty: WordDifficulty;
  responseTimeMs: number;
  timeLimitMs: number;
  hintsUsed: number;
  /** The player's streak count BEFORE this answer (0 if they have no
   * active streak). Isolated per game — callers must pass the
   * game-specific streak, never UserProgression's account-level one. */
  streakBefore: number;
}

export interface RewardCalculationResult {
  baseXp: number;
  speedModifier: number;
  hintModifier: number;
  streakModifier: number;
  /** Final XP, rounded to the nearest integer — the single rounding
   * point for the whole formula (spec §4: "Persist integer XP after a
   * single defined rounding rule"). */
  finalXp: number;
}

/**
 * The single shared reward-calculation engine for all three Arcade games
 * (spec §3: "Use one shared Arcade challenge/reward engine for all three
 * games"; §8; §17: "Centralize all scoring constants and formulas").
 *
 * This service is PURE — no DB access, no side effects. It computes what
 * XP an answer is worth; it never awards it. Awarding account XP is
 * always done by ProgressionService.awardXp, called by the per-game
 * service (ScrambleQuestService/CompleteItService/WordDuelService) after
 * this engine's result has been persisted to the answer's audit row
 * (ArcadeAnswer/WordDuelAnswer) — see spec §3: "server-authoritative"
 * and §9: audit trail requirement.
 *
 * Correctness (was the submitted answer right) is decided by each game's
 * own validation logic BEFORE this is called — this engine only prices a
 * CORRECT answer. A wrong/missed answer never calls this; the caller
 * instead resets that game's streak directly (spec §4: "Wrong answer or
 * missed/expired question resets that game's streak").
 */
@Injectable()
export class RewardEngineService {
  calculate(input: RewardCalculationInput): RewardCalculationResult {
    const baseXp = ARCADE_BASE_XP[input.difficulty];
    const speedModifier = speedModifierFor(
      input.responseTimeMs,
      input.timeLimitMs,
    );
    const hintModifier = hintModifierFor(input.hintsUsed);
    const streakModifier = streakModifierFor(input.streakBefore);

    const rawXp = baseXp * speedModifier * hintModifier * streakModifier;
    // Single defined rounding rule (spec §4): round to nearest integer,
    // applied once, here, at the end — never re-rounded or re-derived
    // downstream.
    const finalXp = Math.round(rawXp);

    return { baseXp, speedModifier, hintModifier, streakModifier, finalXp };
  }
}
