/**
 * Shared geometry for ALI's magpie mark — "The Mystic Scholar" concept
 * approved off the ALI Magpie Concepts design canvas (a perched Eurasian
 * magpie in profile: indigo/violet tail and wing, a monocle, a tucked
 * quill, a softly glowing arcane rune, and a signature gold beak carried
 * across every ALI placement).
 *
 * Coordinates are untouched from the canvas's own 400×460 artwork, just
 * windowed down to the bird itself (the canvas also drew a perch and legs
 * as scene-setting for the concept pitch; ALI floats in the app's UI, so
 * those are dropped here). AliMark, AliMarkHero and AliMarkAnimated all
 * share this viewBox so the three read as the same mark at every size.
 */

export const MAGPIE_VIEW_BOX = '20 80 380 365';
export const MAGPIE_ASPECT = 365 / 380; // height = size * MAGPIE_ASPECT

// -- Tail ---------------------------------------------------------------
export const TAIL_D =
  'M155,295 C122,328 92,362 72,402 C66,414 58,424 40,432 C72,420 104,404 132,376 C155,352 168,326 170,298 Z';
export const TAIL_LINE_A_D = 'M122,332 C106,358 90,384 74,404';
export const TAIL_LINE_B_D = 'M140,318 C122,346 104,374 86,398';
/** The tail's attach point on the body — the pivot for its idle sway. */
export const TAIL_PIVOT = '170, 298';

// -- Body / belly ---------------------------------------------------------
export const BODY = { cx: 195, cy: 255, rx: 98, ry: 108 };
export const BELLY = { cx: 205, cy: 298, rx: 56, ry: 64 };

// -- Tucked quill (the scholar's signature prop) -------------------------
export const QUILL_D = 'M251,193 C246,163 241,133 249,104 C256,129 259,159 257,191 Z';
export const QUILL_LINE_A_D = 'M252,128 L244,126';
export const QUILL_LINE_B_D = 'M254,148 L246,147';
export const QUILL_LINE_C_D = 'M255,168 L248,167';

// -- Wing -----------------------------------------------------------------
export const WING_D =
  'M250,188 C297,198 322,240 316,292 C312,322 289,341 257,335 C270,299 268,254 249,213 Z';
export const WING_HIGHLIGHT_D = 'M270,224 C296,240 301,270 288,300 C280,289 272,259 270,224 Z';
/** The wing's attach point on the shoulder — the pivot for its idle flutter. */
export const WING_PIVOT = '250, 188';

// -- Head -------------------------------------------------------------------
export const HEAD = { cx: 270, cy: 165, r: 60 };
export const HEAD_TUFT_D = 'M254,109 C257,93 268,88 273,99 C266,101 261,107 259,116 Z';

// -- Eye + monocle ----------------------------------------------------------
export const EYE_WHITE = { cx: 296, cy: 158, r: 14 };
export const EYE_PUPIL = { cx: 300, cy: 158, r: 8 };
export const EYE_HIGHLIGHT = { cx: 303, cy: 154, r: 2.6 };
export const EYELID = { cx: 296, cy: 158, rx: 15, ry: 14 };
export const MONOCLE_RING = { cx: 296, cy: 158, r: 18 };
export const MONOCLE_ARM_D = 'M296,140 C312,134 323,144 321,159';
export const GLINT_D = 'M289,150 L292,153';

// -- Beak (ALI's signature gold trait, consistent across every concept) ---
export const BEAK_D =
  'M318,168 C341,165 363,169 380,178 C363,187 341,191 319,190 C315,182 315,174 318,168 Z';

// -- Arcane rune (the scholar's glowing marginal note) -----------------------
export const RUNE_GLOW = { cx: 382, cy: 132, r: 17 };
export const RUNE_CORE = { cx: 382, cy: 132, r: 10 };
export const RUNE_MARK_D = 'M376,128 L388,136 M388,128 L376,136 M382,124 L382,140';
