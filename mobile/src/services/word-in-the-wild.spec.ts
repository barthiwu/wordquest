import {
  createMission,
  createPhotoUploadTarget,
  deleteSubmission,
  getSubmission,
  submitPhotoEvidence,
  submitTextEvidence,
  uploadPhotoToR2,
} from './word-in-the-wild';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('word-in-the-wild service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('creates a mission for a word', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await createMission('tok', 'w1');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/missions', {
      method: 'POST',
      body: { wordId: 'w1' },
      accessToken: 'tok',
    });
  });

  it('requests a photo upload target for a mission', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await createPhotoUploadTarget('tok', 'm1', 'image/jpeg');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/missions/m1/photo-upload-url', {
      method: 'POST',
      body: { contentType: 'image/jpeg' },
      accessToken: 'tok',
    });
  });

  it('submits text evidence', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitTextEvidence('tok', 'm1', 'saw it on a sign');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/submissions', {
      method: 'POST',
      body: { missionId: 'm1', evidenceType: 'TEXT', text: 'saw it on a sign' },
      accessToken: 'tok',
    });
  });

  it('submits photo evidence by key', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitPhotoEvidence('tok', 'm1', 'key.jpg');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/submissions', {
      method: 'POST',
      body: { missionId: 'm1', evidenceType: 'PHOTO', photoKey: 'key.jpg' },
      accessToken: 'tok',
    });
  });

  it('fetches a submission by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getSubmission('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/submissions/s1', {
      accessToken: 'tok',
    });
  });

  it('deletes a submission', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ deleted: true });
    await deleteSubmission('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/word-in-the-wild/submissions/s1', {
      method: 'DELETE',
      accessToken: 'tok',
    });
  });

  describe('uploadPhotoToR2', () => {
    it('never calls apiRequest — it talks to R2 directly, not our backend', async () => {
      const blob = { size: 3 };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ blob: () => Promise.resolve(blob) }) // reading the local photo URI
        .mockResolvedValueOnce({ ok: true }); // the PUT to R2

      await uploadPhotoToR2('https://r2.example.com/signed', 'file:///photo.jpg', 'image/jpeg');

      expect(apiRequest).not.toHaveBeenCalled();
    });

    it('PUTs the blob with the given content type to the presigned URL', async () => {
      const blob = { size: 3 };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ blob: () => Promise.resolve(blob) })
        .mockResolvedValueOnce({ ok: true });

      await uploadPhotoToR2('https://r2.example.com/signed', 'file:///photo.jpg', 'image/png');

      expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://r2.example.com/signed', {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
    });

    it('throws a clear error when the upload PUT fails', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ blob: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: false, status: 403 });

      await expect(
        uploadPhotoToR2('https://r2.example.com/signed', 'file:///photo.jpg', 'image/jpeg'),
      ).rejects.toThrow('Photo upload failed (403)');
    });
  });
});
