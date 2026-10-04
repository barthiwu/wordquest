import type { ComponentType } from 'react';
import { useIsPrototype } from '@/state/uiVersionStore';

/**
 * Picks between the standard and prototype ("New look") implementation of
 * a screen by the current look flag. The hook is called unconditionally
 * and exactly one branch renders, so hook order inside each screen stays
 * stable (a short-circuited hook caused React #311 once already).
 *
 * Call at module scope — the returned component is stable across renders.
 */
export function byLook<P extends object>(
  Standard: ComponentType<P>,
  Proto: ComponentType<P>,
): ComponentType<P> {
  function ByLook(props: P) {
    const proto = useIsPrototype();
    return proto ? <Proto {...props} /> : <Standard {...props} />;
  }
  ByLook.displayName = `ByLook(${Standard.displayName ?? Standard.name ?? 'Screen'})`;
  return ByLook;
}
