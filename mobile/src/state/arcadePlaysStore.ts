import { create } from 'zustand';
import {
  applyNoticeToAllowance,
  getArcadeAllowance,
  type ArcadeAllowance,
  type ArcadePlayNotice,
} from '@/services/arcadePlays';

interface ArcadePlaysState {
  allowance: ArcadeAllowance | null;
  /** The threshold notice (50/70/90/100%) waiting to be shown as a toast. */
  notice: ArcadePlayNotice | null;
  refresh: (accessToken: string) => Promise<void>;
  /** Call with the `playLimit` a game start returned. */
  applyNotice: (notice: ArcadePlayNotice | undefined | null) => void;
  /** Marks a game locked after the server refused a start. */
  markLocked: (game: ArcadePlayNotice['game']) => void;
  dismissNotice: () => void;
  reset: () => void;
}

/**
 * Today's Arcade plays per game. Cosmetic and advisory: the server is the
 * only thing that enforces the cap, so a stale value here can show a wrong
 * badge for a moment but can never let anyone play more or less.
 */
export const useArcadePlaysStore = create<ArcadePlaysState>((set, get) => ({
  allowance: null,
  notice: null,

  refresh: async (accessToken) => {
    try {
      set({ allowance: await getArcadeAllowance(accessToken) });
    } catch {
      // Keep whatever we had: the badges are a convenience.
    }
  },

  applyNotice: (notice) => {
    if (!notice) return;
    set((s) => ({
      allowance: applyNoticeToAllowance(s.allowance, notice),
      notice: notice.percent ? notice : s.notice,
    }));
  },

  markLocked: (game) => {
    const { allowance } = get();
    if (!allowance) return;
    set({
      allowance: {
        ...allowance,
        games: allowance.games.map((g) =>
          g.game === game ? { ...g, used: g.limit ?? g.used, remaining: 0, locked: true } : g,
        ),
      },
    });
  },

  dismissNotice: () => set({ notice: null }),
  reset: () => set({ allowance: null, notice: null }),
}));
