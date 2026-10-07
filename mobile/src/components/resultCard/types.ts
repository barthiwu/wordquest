import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
import type { ArtKind } from '@/features/proto/ui/ProtoArt';

/** Logical size of every share card; captured at 3x for a 1080x1920 status image. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

export interface ResultPlayer {
  id: string;
  /** Public username (never a real name). */
  name: string;
  avatarUrl?: string | null;
  /** 1-based; null when the player has no ranked score. */
  rank: number | null;
  correct: number | null;
  total: number | null;
  timeMs?: number | null;
  isMe: boolean;
}

/** Everything a result card shows, already translated and ready to draw. */
export interface ResultCardData {
  kind: 'group' | 'versus' | 'duel';
  /** "ScrambleQuest", "Word Duel" ... */
  gameLabel: string;
  gameArt: ArtKind;
  /** The group's name, or the game name for a one-on-one. */
  title: string;
  /** "You finished #2 of 5", "You won!" ... */
  headline: string;
  aliMessage: string;
  aliExpression: AliExpression;
  aliPose: AliPose;
  aliIntensity: AliIntensity;
  /** Ranked best-first; the card shows the first few. */
  players: ResultPlayer[];
  playerCount: number;
  /** "of 5 players". */
  ofPlayers: string;
  winnerLabel: string;
  youLabel: string;
  timeLabel: string;
  accuracyLabel: string;
  footer: string;
  /** Short brand line under the footer, e.g. the site address. */
  brand: string;
}

export function meOf(data: ResultCardData): ResultPlayer | null {
  return data.players.find((p) => p.isMe) ?? null;
}

export function pct(p: ResultPlayer | null): number {
  if (!p || p.correct == null || !p.total) return 0;
  return Math.round((p.correct / p.total) * 100);
}
