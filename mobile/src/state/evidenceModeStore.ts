import { create } from 'zustand';

export type EvidenceMode = 'TEXT' | 'PHOTO';

interface EvidenceModeState {
  lastMode: EvidenceMode;
  setLastMode: (mode: EvidenceMode) => void;
}

/**
 * Remembers which evidence mode (Text vs Photo) the player used last, so
 * SubmitEvidenceScreen opens on whichever one they actually use instead of
 * always defaulting to Text. This is a presentation preference, not
 * progression state, so it's session-only (in-memory) rather than
 * SecureStore/AsyncStorage-backed — frontend owns local prefs, backend
 * owns progression truth (BUILD_HANDOFF §40).
 */
export const useEvidenceModeStore = create<EvidenceModeState>((set) => ({
  lastMode: 'TEXT',
  setLastMode: (mode) => set({ lastMode: mode }),
}));
