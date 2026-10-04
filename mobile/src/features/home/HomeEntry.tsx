import type { ComponentProps } from 'react';
import { useIsNewLook } from '@/state/uiVersionStore';
import { HomeScreen } from './HomeScreen';
import { NewHomeScreen } from './NewHomeScreen';

/** Picks the classic or redesigned Home from the "New look" flag. Both
 * receive the identical tab-screen props, so switching is a pure render
 * swap and never changes navigation state. */
export function HomeEntry(props: ComponentProps<typeof HomeScreen>) {
  const newLook = useIsNewLook();
  return newLook ? <NewHomeScreen {...props} /> : <HomeScreen {...props} />;
}
