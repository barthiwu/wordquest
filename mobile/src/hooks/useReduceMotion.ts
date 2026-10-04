import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True once the OS reports reduced motion is on. Starts false ("not yet
 * known" is not "reduce"), then follows live changes. ALI uses it to fall
 * back to a held still frame (Bible: reduced-motion fallbacks).
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (!cancelled) setReduce(!!enabled);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled: boolean) => {
      if (!cancelled) setReduce(!!enabled);
    });
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
