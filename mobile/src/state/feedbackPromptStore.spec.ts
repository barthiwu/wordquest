import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFeedbackPromptStore } from './feedbackPromptStore';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

describe('useFeedbackPromptStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useFeedbackPromptStore.setState({ lastShownAt: null, isHydrated: false });
  });

  describe('canShowPrompt', () => {
    it('returns false before hydration, even with no prior prompt', () => {
      expect(useFeedbackPromptStore.getState().canShowPrompt()).toBe(false);
    });

    it('returns true once hydrated with no prior prompt recorded', async () => {
      await useFeedbackPromptStore.getState().hydrate();
      expect(useFeedbackPromptStore.getState().canShowPrompt()).toBe(true);
    });

    it('returns false immediately after recordShown', async () => {
      await useFeedbackPromptStore.getState().hydrate();
      useFeedbackPromptStore.getState().recordShown();
      expect(useFeedbackPromptStore.getState().canShowPrompt()).toBe(false);
    });

    it('returns false just under the 3-day cooldown', async () => {
      useFeedbackPromptStore.setState({
        lastShownAt: Date.now() - (THREE_DAYS_MS - 60_000),
        isHydrated: true,
      });
      expect(useFeedbackPromptStore.getState().canShowPrompt()).toBe(false);
    });

    it('returns true once the 3-day cooldown has fully elapsed', async () => {
      useFeedbackPromptStore.setState({
        lastShownAt: Date.now() - (THREE_DAYS_MS + 1_000),
        isHydrated: true,
      });
      expect(useFeedbackPromptStore.getState().canShowPrompt()).toBe(true);
    });
  });

  describe('hydrate', () => {
    it('loads a previously persisted timestamp', async () => {
      const ts = Date.now() - 1_000;
      await AsyncStorage.setItem('wordquest.lastFeedbackPromptShownAt.v1', String(ts));

      await useFeedbackPromptStore.getState().hydrate();

      expect(useFeedbackPromptStore.getState().lastShownAt).toBe(ts);
      expect(useFeedbackPromptStore.getState().isHydrated).toBe(true);
    });

    it('resolves to null/hydrated when nothing was stored', async () => {
      await useFeedbackPromptStore.getState().hydrate();
      expect(useFeedbackPromptStore.getState().lastShownAt).toBeNull();
      expect(useFeedbackPromptStore.getState().isHydrated).toBe(true);
    });
  });

  describe('recordShown', () => {
    it('persists the timestamp to AsyncStorage', async () => {
      useFeedbackPromptStore.getState().recordShown();
      await Promise.resolve();

      const stored = await AsyncStorage.getItem('wordquest.lastFeedbackPromptShownAt.v1');
      expect(Number(stored)).toBeGreaterThan(0);
    });
  });
});
