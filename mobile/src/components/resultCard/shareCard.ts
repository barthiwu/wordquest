import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Native: whether a separate "Download image" button makes sense (the share sheet already has Save Image). */
export const SUPPORTS_DOWNLOAD_BUTTON = false;
export function canShareFiles(): boolean {
  return true;
}

/**
 * Renders the card to a 1080x1920 PNG and opens the system share sheet (which
 * also offers "Save Image" and Status / Stories targets).
 */
export async function shareCardImage(
  node: unknown,
  opts: { fileName: string; title: string },
): Promise<ShareOutcome> {
  const uri = await captureRef(node as never, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: 1080,
    height: 1920,
    fileName: opts.fileName,
  });
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: opts.title,
  });
  return 'shared';
}

export async function downloadCardImage(
  node: unknown,
  opts: { fileName: string; title: string },
): Promise<ShareOutcome> {
  return shareCardImage(node, opts);
}
