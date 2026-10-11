import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { bytesToBase64 } from '@/utils/base64';

export type FileExportOutcome = 'shared' | 'downloaded';

export interface FileExportOptions {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  /** iOS uniform type identifier, e.g. "public.comma-separated-values-text". */
  uti?: string;
  /** Title of the share sheet (Android). */
  title: string;
}

/**
 * Native: writes the file to the app's cache and opens the system share
 * sheet, which also offers Save to Files / Drive, Mail and WhatsApp.
 */
export async function exportFile(opts: FileExportOptions): Promise<FileExportOutcome> {
  const uri = `${FileSystem.cacheDirectory ?? ''}${opts.fileName}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(new Uint8Array(opts.bytes)), {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  await Sharing.shareAsync(uri, {
    mimeType: opts.mimeType,
    UTI: opts.uti,
    dialogTitle: opts.title,
  });
  return 'shared';
}
