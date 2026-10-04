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

/** Journey stage key (or display name, e.g. "The Village") → scene art. */
export function sceneForStage(stage: string | undefined | null): SceneVariant {
  if (!stage) return 'forest';
  const key = stage.trim().toLowerCase().replace(/^the\s+/, '');
  return STAGE_SCENES[key] ?? 'forest';
}
