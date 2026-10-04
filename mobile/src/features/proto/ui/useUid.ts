import { useRef } from 'react';

let counter = 0;

/**
 * Stable per-instance id for SVG gradient/filter ids. On web every mounted
 * tab screen shares one DOM, so a fixed id like "bg-scramble" defined in a
 * hidden screen shadows the same id in the visible one and the fill
 * resolves to nothing.
 */
export function useUid(prefix = 'pu'): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    counter += 1;
    ref.current = `${prefix}${counter}`;
  }
  return ref.current;
}
