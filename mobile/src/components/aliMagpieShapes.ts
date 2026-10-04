/**
 * Geometry for ALI — "The Mystic Scholar": a real Eurasian magpie (black
 * head/back/chest, white belly, iridescent blue-teal wing, long graduated
 * tail) carrying the scholar kit the character was approved with: the
 * signature gold beak, a gold monocle over a cream eye, a cream quill
 * tucked behind the head, and a floating arcane rune. Perched, side view
 * facing right; never owl-like.
 *
 * Everything is authored in one 480x340 coordinate space. The wing and
 * tail are *feather fans* (separate tapered feathers rotated about one
 * pivot) so folding, flaring and flapping come from rotating feathers,
 * not from swapping artwork — the single-rig rule from the ALI
 * Character & Animation Bible §15.
 */

/** Padded so a fully-spread wing / tail and a small flight bob stay inside the frame. */
export const MAGPIE_VIEW_BOX = '-60 -10 500 410';
export const MAGPIE_ASPECT = 410 / 500; // height = width * MAGPIE_ASPECT

export const WING_PIVOT = { x: 236, y: 140 } as const;
export const TAIL_PIVOT = { x: 180, y: 222 } as const;
export const HEAD_PIVOT = { x: 252, y: 132 } as const;
/** Where the feet touch the ground; the body rotates about this. */
export const FEET = { x: 214, y: 306 } as const;
export const EYE = { x: 282, y: 92, r: 13, pupil: 7 } as const;
export const MONOCLE = { r: 20 } as const;
export const BEAK_PIVOT = { x: 304, y: 106 } as const;

export function originOf(p: { x: number; y: number }): string {
  return `${p.x}, ${p.y}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A tapered, pointed feather laid out along +x from (px, py). Rotate it about (px, py). */
export function featherPath(px: number, py: number, length: number, width: number): string {
  const L = length;
  const w = width;
  return (
    `M${px},${r2(py - w * 0.55)} ` +
    `C${r2(px + L * 0.25)},${r2(py - w * 1.05)} ${r2(px + L * 0.7)},${r2(py - w * 0.95)} ${px + L},${py} ` +
    `C${r2(px + L * 0.7)},${r2(py + w * 0.95)} ${r2(px + L * 0.25)},${r2(py + w * 1.05)} ${px},${r2(py + w * 0.55)} Z`
  );
}

export interface FeatherSpec {
  length: number;
  width: number;
  /** Angle (deg, clockwise from +x) when the fan is folded. */
  folded: number;
  /** Angle when the fan is fully open. */
  open: number;
  d: string;
  /** Centre shaft line. */
  shaft: string;
}

function fan(
  pivot: { x: number; y: number },
  lengths: number[],
  widths: number[],
  folded: (i: number, n: number) => number,
  open: (i: number, n: number) => number,
): FeatherSpec[] {
  const n = lengths.length;
  return lengths.map((length, i) => ({
    length,
    width: widths[i],
    folded: folded(i, n),
    open: open(i, n),
    d: featherPath(pivot.x, pivot.y, length, widths[i]),
    shaft: `M${pivot.x + 6},${pivot.y} L${r2(pivot.x + length * 0.92)},${pivot.y}`,
  }));
}

/** Eight flight feathers; index 0 is the longest and lies lowest when folded. */
export const WING_FEATHERS: FeatherSpec[] = fan(
  WING_PIVOT,
  [150, 148, 142, 132, 120, 108, 96, 84],
  [26, 25, 24, 23, 22, 20, 18, 16],
  (i) => 160 + i * 1.3,
  (i) => 176 + i * 13,
);

/** Five long tail feathers fanning about the rump. */
export const TAIL_FEATHERS: FeatherSpec[] = fan(
  TAIL_PIVOT,
  [200, 190, 174, 156, 136],
  [21, 20, 19, 18, 16],
  (i, n) => 156 + (i - (n - 1) / 2) * 2.4,
  (i, n) => 156 + (i - (n - 1) / 2) * 16,
);

/** The far-side wing only shows when open, so it uses a lighter subset. */
export const FAR_WING_FEATHER_INDEXES = [0, 2, 4, 6, 7] as const;

// -- Static body parts ---------------------------------------------------
export const BODY_D =
  'M232,112 C206,128 176,160 160,206 C150,236 176,262 212,266 C256,270 304,242 312,200 C318,170 300,138 282,122 C266,110 248,104 232,112 Z';
export const BELLY_D =
  'M226,196 C256,176 296,186 304,212 C308,242 274,270 232,266 C198,260 192,222 226,196 Z';
export const BELLY_LINE_D = 'M232,238 C250,252 276,252 292,236';
export const SHOULDER_STREAK_D = 'M214,138 C232,126 256,130 262,146 C246,142 230,144 214,152 Z';
export const HEAD_D =
  'M226,116 C228,84 252,62 282,66 C302,69 312,84 312,100 C312,120 296,136 270,142 C246,148 224,138 226,116 Z';
export const HEAD_SHEEN_D = 'M246,76 C262,66 284,66 296,78 C282,76 262,78 246,90 Z';
export const BILL_UPPER_D = 'M300,90 C318,88 340,94 356,106 C338,108 318,106 300,106 Z';
export const BILL_UPPER_SHEEN_D = 'M308,94 C324,92 336,96 346,101';
export const BILL_LOWER_D = 'M300,106 C318,106 338,108 350,112 C336,118 318,118 302,114 Z';

const w = WING_PIVOT;
/** Scalloped coverts that blend the wing into the shoulder. */
export const COVERTS_D =
  `M${w.x - 26},${w.y + 2} C${w.x - 10},${w.y - 20} ${w.x + 26},${w.y - 16} ${w.x + 32},${w.y + 12} ` +
  `C${w.x + 30},${w.y + 36} ${w.x + 4},${w.y + 58} ${w.x - 34},${w.y + 62} ` +
  `C${w.x - 60},${w.y + 50} ${w.x - 58},${w.y + 24} ${w.x - 48},${w.y + 14} ` +
  `C${w.x - 40},${w.y + 8} ${w.x - 32},${w.y + 4} ${w.x - 26},${w.y + 2} Z`;
export const COVERTS_LINES_D =
  `M${w.x - 20},${w.y + 14} C${w.x - 6},${w.y + 34} ${w.x - 16},${w.y + 46} ${w.x - 30},${w.y + 54} ` +
  `M${w.x + 4},${w.y + 8} C${w.x + 14},${w.y + 26} ${w.x + 4},${w.y + 40} ${w.x - 8},${w.y + 48}`;

/** One leg drawn at hip x with a small foot offset. */
export function legPath(x: number, off: number): { leg: string; foot: string } {
  return {
    leg: `M${x},258 L${x + off},300`,
    foot: `M${x + off - 14},306 L${x + off + 16},306 M${x + off},300 L${x + off - 12},306 M${x + off},300 L${x + off + 10},307`,
  };
}

/** Where celebration sparkles twinkle (viewBox units), roughly ringing the bird. */
export const SPARKLE_SPOTS: Array<{ x: number; y: number; s: number }> = [
  { x: 330, y: 46, s: 1 },
  { x: 120, y: 60, s: 0.8 },
  { x: 372, y: 150, s: 0.7 },
  { x: 40, y: 150, s: 0.9 },
  { x: 200, y: 22, s: 0.75 },
  { x: 300, y: 250, s: 0.65 },
];

/** A four-point star centred on 0,0 with radius 1 (scale it). */
export const STAR_D =
  'M0,-1 C0.12,-0.28 0.28,-0.12 1,0 C0.28,0.12 0.12,0.28 0,1 C-0.12,0.28 -0.28,0.12 -1,0 C-0.28,-0.12 -0.12,-0.28 0,-1 Z';

/** Gold monocle chain hanging from the ring down the cheek (drawn in head space). */
export const MONOCLE_CHAIN_D = `M${EYE.x - 11},${EYE.y + 18} C${EYE.x - 16},${EYE.y + 36} ${EYE.x - 7},${EYE.y + 46} ${EYE.x - 13},${EYE.y + 60}`;
export const MONOCLE_GLINT_D = `M${EYE.x - 11},${EYE.y - 10} L${EYE.x - 6},${EYE.y - 15}`;

/** The cream quill tucked behind the head: laid out along +x from its base, then rotated. */
export const QUILL = { x: 236, y: 132, angle: -124, length: 84, width: 10 } as const;
export const QUILL_D = featherPath(QUILL.x, QUILL.y, QUILL.length, QUILL.width);
export const QUILL_SHAFT_D = `M${QUILL.x + 10},${QUILL.y} L${QUILL.x + QUILL.length - 8},${QUILL.y}`;
export const QUILL_BARBS_D = [26, 42, 58, 72]
  .map(
    (t) =>
      `M${QUILL.x + t},${QUILL.y - 1} L${QUILL.x + t - 9},${QUILL.y - 10} M${QUILL.x + t},${QUILL.y + 1} L${QUILL.x + t - 9},${QUILL.y + 10}`,
  )
  .join(' ');

/** The arcane rune floating ahead of the beak. */
export const RUNE = { x: 396, y: 70, core: 13, halo: 34, orbit: 21 } as const;
export const RUNE_MARK_D = `M${RUNE.x - 7},${RUNE.y - 5} L${RUNE.x + 7},${RUNE.y + 5} M${RUNE.x + 7},${RUNE.y - 5} L${RUNE.x - 7},${RUNE.y + 5} M${RUNE.x},${RUNE.y - 9} L${RUNE.x},${RUNE.y + 9}`;
export const RUNE_ORBIT_DOTS: Array<{ x: number; y: number }> = [0, 90, 180, 270].map((a) => ({
  x: RUNE.x + Math.cos((a * Math.PI) / 180) * RUNE.orbit,
  y: RUNE.y + Math.sin((a * Math.PI) / 180) * RUNE.orbit,
}));
