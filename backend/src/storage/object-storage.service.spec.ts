import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ObjectStorageService } from './object-storage.service';
import { AppConfigService } from '../config/config.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  };
});

describe('ObjectStorageService', () => {
  let service: ObjectStorageService;
  let configured: boolean;

  const configMock = {
    get isStorageConfigured() {
      return configured;
    },
    storageEndpoint: 'https://example.r2.cloudflarestorage.com',
    storageRegion: 'auto',
    storageBucket: 'wordquest-evidence',
    storageAccessKeyId: 'key-id',
    storageSecretAccessKey: 'secret',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configured = true;
    const moduleRef = await Test.createTestingModule({
      providers: [ObjectStorageService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(ObjectStorageService);
  });

  describe('isStorageConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isStorageConfigured()).toBe(true);
      configured = false;
      expect(service.isStorageConfigured()).toBe(false);
    });
  });

  describe('createUploadTarget', () => {
    it('throws ServiceUnavailableException when storage is not configured, without calling the SDK', async () => {
      configured = false;
      await expect(service.createUploadTarget('u1', 'image/jpeg')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('returns a key scoped to the user and a presigned upload URL', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('https://signed-upload-url.example.com');

      const result = await service.createUploadTarget('u1', 'image/jpeg');

      expect(result.key).toMatch(/^word-in-the-wild\/u1\/.+\.jpg$/);
      expect(result.uploadUrl).toBe('https://signed-upload-url.example.com');
    });

    it('picks the file extension from the content type', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('url');
      const jpeg = await service.createUploadTarget('u1', 'image/jpeg');
      expect(jpeg.key).toMatch(/\.jpg$/);

      (getSignedUrl as jest.Mock).mockResolvedValueOnce('url');
      const png = await service.createUploadTarget('u1', 'image/png');
      expect(png.key).toMatch(/\.png$/);
    });

    it('uses the given key prefix instead of the word-in-the-wild default when provided', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('url');
      const result = await service.createUploadTarget('u1', 'image/png', 'evidence');
      expect(result.key).toMatch(/^evidence\/u1\/.+\.png$/);
    });

    it('generates a distinct key on every call', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('url');
      const a = await service.createUploadTarget('u1', 'image/jpeg');
      const b = await service.createUploadTarget('u1', 'image/jpeg');
      expect(a.key).not.toBe(b.key);
    });
  });

  describe('getDownloadUrl', () => {
    it('throws when storage is not configured', async () => {
      configured = false;
      await expect(service.getDownloadUrl('some/key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns the presigned URL from the SDK', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('https://signed-download-url.example.com');
      const url = await service.getDownloadUrl('word-in-the-wild/u1/abc.jpg');
      expect(url).toBe('https://signed-download-url.example.com');
    });
  });

  describe('delete', () => {
    it('throws when storage is not configured', async () => {
      configured = false;
      await expect(service.delete('some/key.jpg')).rejects.toThrow(ServiceUnavailableException);
    });

    it('resolves without error when configured', async () => {
      await expect(service.delete('word-in-the-wild/u1/abc.jpg')).resolves.toBeUndefined();
    });
  });

  describe('getObjectBytes', () => {
    it('throws when storage is not configured', async () => {
      configured = false;
      await expect(service.getObjectBytes('some/key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('collects the response body stream into a single Buffer', async () => {
      const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
      async function* fakeStream() {
        yield new Uint8Array([1, 2, 3]);
        yield new Uint8Array([4, 5]);
      }
      S3Client.mockImplementationOnce(() => ({
        send: jest.fn().mockResolvedValue({ Body: fakeStream() }),
      }));
      // Rebuild the service so it picks up this call's mock implementation.
      const moduleRef = await Test.createTestingModule({
        providers: [ObjectStorageService, { provide: AppConfigService, useValue: configMock }],
      }).compile();
      const freshService = moduleRef.get(ObjectStorageService);

      const bytes = await freshService.getObjectBytes('word-in-the-wild/u1/abc.jpg');

      expect(bytes).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });
  });
});
