import { Platform, Share } from 'react-native';

/** Copies text to the clipboard where the platform allows it (web). False when it cannot. */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** True where a "Copy link" button can work. */
export function canCopyText(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;
}

/**
 * Opens the system share sheet (the browser's, where it has one). Returns
 * false when sharing is unavailable or was dismissed; the link is always
 * on screen too, so this is a convenience.
 */
export async function shareMessage(message: string): Promise<boolean> {
  try {
    const result = await Share.share({ message });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
