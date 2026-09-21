// Mirrors backend/src/config/gameplay-rules.ts's `xp.levelThresholds`
// and `glyphRewardForLevel()` (Final Core Progression Specification
// §3.2/§3.4) -- the exact 100-level v1.0 XP curve, duplicated here
// (display-only, same pattern as constants/country-continent mirroring
// on the leaderboard work) so the Level roadmap can render the full
// ladder, including levels the player hasn't reached yet, without a
// dedicated endpoint. Index 0 = Level 1 (0 XP). If the backend curve
// ever changes, this needs updating alongside it.
export const LEVEL_THRESHOLDS: number[] = [
  0, 6160, 12459, 18899, 25484, 32217, 39101, 46140, 53337, 60696, 68220, 75913, 83779, 91822,
  100046, 108454, 117052, 125842, 134830, 144020, 153417, 163024, 172848, 182892, 193162, 203663,
  214400, 225378, 236603, 248080, 259815, 271813, 284081, 296625, 309451, 322565, 335973, 349683,
  363701, 378034, 392689, 407674, 422995, 438660, 454677, 471055, 487800, 504922, 522428, 540328,
  558630, 577343, 596476, 616040, 636043, 656496, 677409, 698791, 720654, 743008, 765864, 789234,
  813129, 837561, 862542, 888085, 914201, 940904, 968208, 996124, 1024669, 1053854, 1083696,
  1114207, 1145405, 1177304, 1209919, 1243267, 1277365, 1312229, 1347876, 1384325, 1421592,
  1459697, 1498658, 1538495, 1579226, 1620873, 1663456, 1706996, 1751514, 1797032, 1843574,
  1891161, 1939817, 1989567, 2040435, 2092446, 2145625, 2200000,
];

/** Glyphs granted once per level, by ten-level tier. Level 1 grants nothing. */
export function glyphRewardForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 10) return 2;
  if (level <= 20) return 3;
  if (level <= 30) return 4;
  if (level <= 40) return 5;
  if (level <= 50) return 6;
  if (level <= 60) return 7;
  if (level <= 70) return 8;
  if (level <= 80) return 9;
  if (level <= 90) return 10;
  return 12;
}

export interface LevelRoadmapEntry {
  level: number;
  xpRequired: number;
  glyphReward: number;
}

export const LEVEL_ROADMAP: LevelRoadmapEntry[] = LEVEL_THRESHOLDS.map((xpRequired, i) => ({
  level: i + 1,
  xpRequired,
  glyphReward: glyphRewardForLevel(i + 1),
}));
