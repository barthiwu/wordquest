import type { ComponentProps } from 'react';
import { NewHomeScreen } from './NewHomeScreen';

/** Home tab entry point. (The illustrated prototype Home plugs in here
 * once built; both receive the identical tab-screen props.) */
export function HomeEntry(props: ComponentProps<typeof NewHomeScreen>) {
  return <NewHomeScreen {...props} />;
}
