import {
  acknowledgeUnderstanding,
  completeWord,
  createOptionalWildMission,
  listQuests,
  requestHint,
  requestLetterReveal,
  requestSynonym,
  startQuest,
  submitAnswer,
  submitParagraph,
  submitSentence,
} from './quests';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('quests service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('requests the quest catalog', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await listQuests('tok');
    expect(apiRequest).toHaveBeenCalledWith('/quests', { accessToken: 'tok' });
  });

  describe('startQuest', () => {
    // Player local date/hour are derived server-side from the player's
    // stored timezone now (Player Timezone System, V1 Remaining Systems
    // Spec §15) — no client-submitted body at all, closing what used to
    // be a real spoofing vector (a client could previously lie about its
    // own clock to unlock a quest window early).
    it('posts with no request body', async () => {
      (apiRequest as jest.Mock).mockResolvedValueOnce({});

      await startQuest('tok', 'morning-quest');

      expect(apiRequest).toHaveBeenCalledWith('/quests/morning-quest/start', {
        method: 'POST',
        accessToken: 'tok',
      });
    });

    it('builds the URL from the given quest key', async () => {
      (apiRequest as jest.Mock).mockResolvedValueOnce({});
      await startQuest('tok', 'noon-quest');
      const [path] = (apiRequest as jest.Mock).mock.calls[0];
      expect(path).toBe('/quests/noon-quest/start');
    });
  });

  it('submits an answer to the right attempt', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitAnswer('tok', 'attempt-1', 'greeting');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/answer', {
      method: 'POST',
      body: { answer: 'greeting' },
      accessToken: 'tok',
    });
  });

  it('requests a hint', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await requestHint('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/hint', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('requests a synonym', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await requestSynonym('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/synonym', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('requests a letter reveal', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await requestLetterReveal('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/reveal-letter', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('acknowledges understanding', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ wordStage: 'SENTENCE' });
    await acknowledgeUnderstanding('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith(
      '/quests/attempts/attempt-1/acknowledge-understanding',
      {
        method: 'POST',
        accessToken: 'tok',
      },
    );
  });

  it('submits a sentence', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitSentence('tok', 'attempt-1', 'A sentence.');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/sentence', {
      method: 'POST',
      body: { sentence: 'A sentence.' },
      accessToken: 'tok',
    });
  });

  it('submits a paragraph', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitParagraph('tok', 'attempt-1', 'A paragraph.');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/paragraph', {
      method: 'POST',
      body: { paragraph: 'A paragraph.' },
      accessToken: 'tok',
    });
  });

  it('creates an optional Word in the Wild mission for the current word', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await createOptionalWildMission('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/optional-wild-mission', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('completes the word', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await completeWord('tok', 'attempt-1');
    expect(apiRequest).toHaveBeenCalledWith('/quests/attempts/attempt-1/complete-word', {
      method: 'POST',
      accessToken: 'tok',
    });
  });
});
