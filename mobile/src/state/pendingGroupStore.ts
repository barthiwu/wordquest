import { create } from 'zustand';

interface PendingGroupState {
  /** A group code from a link opened before the player was signed in. */
  code: string | null;
  setCode: (code: string | null) => void;
}

/**
 * Remembers the group link a signed-out person opened, through sign-in and
 * onboarding, so they land on that group's join screen afterwards instead
 * of losing the link. Memory only: it is a convenience, and the link itself
 * still works if it is lost.
 */
export const usePendingGroupStore = create<PendingGroupState>((set) => ({
  code: null,
  setCode: (code) => set({ code }),
}));
