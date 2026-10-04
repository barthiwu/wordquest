import { byLook } from '@/features/proto/byLook';
import { ProtoHomeScreen } from '@/features/proto/ProtoHomeScreen';
import { NewHomeScreen } from './NewHomeScreen';

/** Home tab entry point: standard Home, or the illustrated prototype Home
 * when "New look" is on. Both receive the identical tab-screen props. */
export const HomeEntry = byLook(NewHomeScreen, ProtoHomeScreen as typeof NewHomeScreen);
