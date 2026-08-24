import { getMasterChallengeStatus, submitMasterChallenge } from './masterChallenge';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('masterChallenge service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Player local date is derived server-side from the player's stored
  // timezone now (Player Timezone System, V1 Remaining Systems Spec
  // §15) — no client-submitted date at all, closing the same spoofing
  // vector startQuest's spec documents.
  it("requests today's status with no client-submitted date", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getMasterChallengeStatus('tok');
    expect(apiRequest).toHaveBeenCalledWith('/master-challenge/status', { accessToken: 'tok' });
  });

  it('submits a paragraph with no client-submitted date', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitMasterChallenge('tok', 'A paragraph.');
    expect(apiRequest).toHaveBeenCalledWith('/master-challenge/submit', {
      method: 'POST',
      body: { paragraph: 'A paragraph.' },
      accessToken: 'tok',
    });
  });
});
