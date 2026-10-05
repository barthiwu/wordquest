import { Platform } from 'react-native';

const RELOADED_AT_KEY = 'wordquest.staleBundleReload.v1';
const MIN_GAP_MS = 60_000;

/** True for the error Metro's web runtime throws when a split code file can't be loaded. */
export function isStaleBundleError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null | undefined;
  if (!e) return false;
  return (
    e.name === 'AsyncRequireError' ||
    /split bundle|Loading module|dynamically imported module|ChunkLoadError/i.test(e.message ?? '')
  );
}

/**
 * A web tab opened before a deploy still runs the old code, and asks for
 * code files that deploy deleted. The cure is a fresh page load, which picks
 * up the new build. Reloads at most once a minute so a real outage can't
 * loop. Returns whether it reloaded.
 */
export function reloadIfStaleBundle(error: unknown): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !isStaleBundleError(error)) {
    return false;
  }
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Catches stale-code failures nobody handled (web only). Returns the cleanup. */
export function installStaleBundleRecovery(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const onRejection = (event: PromiseRejectionEvent) => {
    reloadIfStaleBundle(event.reason);
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
