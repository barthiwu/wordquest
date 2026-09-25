import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';

const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60; // 5 minutes to actually perform the PUT
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60; // long enough to view, short enough not to be a permanent public link

export type UploadContentType = 'image/jpeg' | 'image/png';

export interface UploadTarget {
  /** The object key to record and later reference for download/delete — never a full URL. */
  key: string;
  /** Short-lived — expires in UPLOAD_URL_EXPIRY_SECONDS. The client must PUT the file to this URL promptly. */
  uploadUrl: string;
}

/**
 * Word in the Wild's photo evidence path (Cloudflare R2 today — an
 * S3-compatible API, so this would work unchanged against AWS S3 or
 * Backblaze B2 too). The mobile app uploads bytes DIRECTLY to the bucket
 * using a presigned URL from createUploadTarget — this backend's job is
 * to hand out and revoke access, never to proxy image bytes through the
 * NestJS server itself.
 *
 * isStorageConfigured() lets callers check availability and return a
 * clear "not set up yet" response, rather than every call site needing
 * its own try/catch around a config error.
 */
@Injectable()
export class ObjectStorageService {
  private client: S3Client | null = null;

  constructor(private readonly config: AppConfigService) {}

  isStorageConfigured(): boolean {
    return this.config.isStorageConfigured;
  }

  async createUploadTarget(
    userId: string,
    contentType: UploadContentType,
    keyPrefix = 'word-in-the-wild',
  ): Promise<UploadTarget> {
    const client = this.getClient();
    const extension = this.extensionForContentType(contentType);
    const key = `${keyPrefix}/${userId}/${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.config.storageBucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_EXPIRY_SECONDS },
    );

    return { key, uploadUrl };
  }

  async getDownloadUrl(key: string): Promise<string> {
    const client = this.getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.config.storageBucket, Key: key }),
      {
        expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
      },
    );
  }

  /**
   * Fetches the object's raw bytes server-side — for handing to
   * EvidenceAssessmentService, which needs the actual image data, not a
   * URL Claude would have to fetch itself. Distinct from
   * getDownloadUrl(), which is for the mobile app to display the photo.
   */
  async getObjectBytes(key: string): Promise<Buffer> {
    const client = this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: this.config.storageBucket, Key: key }),
    );
    const stream = response.Body as unknown as AsyncIterable<Uint8Array>;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const client = this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.config.storageBucket, Key: key }));
  }

  private extensionForContentType(contentType: UploadContentType): string {
    switch (contentType) {
      case 'image/png':
        return 'png';
      default:
        return 'jpg';
    }
  }

  private getClient(): S3Client {
    if (!this.config.isStorageConfigured) {
      throw new ServiceUnavailableException(
        'Photo evidence storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
      );
    }
    if (!this.client) {
      this.client = new S3Client({
        endpoint: this.config.storageEndpoint,
        region: this.config.storageRegion,
        credentials: {
          accessKeyId: this.config.storageAccessKeyId,
          secretAccessKey: this.config.storageSecretAccessKey,
        },
        // R2's default S3 API endpoint (<accountId>.r2.cloudflarestorage.com)
        // doesn't resolve virtual-hosted-style requests (<bucket>.<endpoint>) --
        // only path-style (<endpoint>/<bucket>/<key>), which is also exactly the
        // shape Cloudflare's own dashboard shows as "S3 API" for a bucket.
        // Without this the SDK's default virtual-hosted addressing produces a
        // <bucket>.<accountId>.r2.cloudflarestorage.com host that never resolves.
        forcePathStyle: true,
      });
    }
    return this.client;
  }
}
