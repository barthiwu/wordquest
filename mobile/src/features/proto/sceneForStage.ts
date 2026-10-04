import type { SceneVariant } from './ui/SceneBackdrop';

const STAGE_SCENES: Record<string, SceneVariant> = {
  forest: 'forest',
  hamlet: 'hamlet',
  village: 'village',
  mountain: 'mountain',
  castle: 'castle',
  city: 'city',
  town: 'town',
  kingdom: 'kingdom',
  legend: 'legend',
};

/** Journey stage key → the scene art that represents it. */
export function sceneForStage(stageKey: string | undefined | null): SceneVariant {
  if (!stageKey) return 'forest';
  return STAGE_SCENES[stageKey.toLowerCase()] ?? 'forest';
}
