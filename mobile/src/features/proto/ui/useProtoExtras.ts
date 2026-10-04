import { useThemeStore } from '@/state/themeStore';
import { protoDarkExtras, protoLightExtras, type ProtoExtras } from './protoTheme';

/** Prototype-only tokens for the current light/dark mode. */
export function useProtoExtras(): ProtoExtras {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'light' ? protoLightExtras : protoDarkExtras;
}
