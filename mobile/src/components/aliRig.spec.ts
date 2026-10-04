import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
import {
  CHANNEL_LIMITS,
  CHANNEL_NAMES,
  EXPRESSIONS,
  INTENSITY_AMPLITUDE,
  MAX_LAYERS,
  POSES,
  resolveAliRig,
} from './aliRig';

const EXPRESSION_IDS = Object.keys(EXPRESSIONS) as AliExpression[];
const POSE_IDS = Object.keys(POSES) as AliPose[];

describe('aliRig', () => {
  it('covers exactly the Bible 12 expressions and 16 poses', () => {
    expect(EXPRESSION_IDS).toHaveLength(12);
    expect(POSE_IDS).toHaveLength(16);
  });

  it('resolves every expression x pose x intensity inside channel limits with a valid layer set', () => {
    for (const e of EXPRESSION_IDS) {
      for (const p of POSE_IDS) {
        for (const i of [0, 1, 2, 3, 4, 5] as AliIntensity[]) {
          const r = resolveAliRig(e, p, i);
          CHANNEL_NAMES.forEach((n) => {
            expect(Number.isFinite(r.channels[n])).toBe(true);
            const lim = CHANNEL_LIMITS[n];
            if (lim) {
              expect(r.channels[n]).toBeGreaterThanOrEqual(lim[0]);
              expect(r.channels[n]).toBeLessThanOrEqual(lim[1]);
            }
          });
          expect(r.layers.length).toBeLessThanOrEqual(MAX_LAYERS);
        }
      }
    }
  });

  it('keeps every motion layer well-formed: equal-length keyframes, rest at the end of one-shots, closed loops', () => {
    const layers = [
      ...POSE_IDS.flatMap((p) => POSES[p].layers ?? []),
      ...EXPRESSION_IDS.flatMap((e) => EXPRESSIONS[e].gesture ?? []),
    ];
    expect(layers.length).toBeGreaterThan(20);
    layers.forEach((layer) => {
      const lens = Object.values(layer.keys).map((k) => (k as number[]).length);
      expect(lens.length).toBeGreaterThan(0);
      expect(new Set(lens).size).toBe(1);
      expect(lens[0]).toBeGreaterThanOrEqual(2);
      expect(layer.ms).toBeGreaterThan(0);
      Object.values(layer.keys).forEach((k) => {
        const keys = k as number[];
        // Every cycle ends where it began (loops) and every finished gesture settles to rest (offset 0).
        expect(keys[keys.length - 1]).toBeCloseTo(0);
        if (layer.iterations === 'loop') expect(keys[0]).toBeCloseTo(0);
      });
    });
  });

  it('gives every expression a distinct held face', () => {
    const faces = new Set(
      EXPRESSION_IDS.map((e) => {
        const c = resolveAliRig(e, 'PERCHED', 2).channels;
        return [
          c.lid,
          c.lower,
          c.lidSlant,
          c.brow,
          c.beak,
          c.pupil,
          c.headRot,
          c.headY,
          c.rune,
        ].join('|');
      }),
    );
    expect(faces.size).toBe(12);
  });

  it('gives every expression except NEUTRAL a gesture or a distinct held pose', () => {
    EXPRESSION_IDS.filter((e) => e !== 'NEUTRAL').forEach((e) => {
      expect(EXPRESSIONS[e].gesture?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('scales gesture size with intensity tier', () => {
    const peak = (i: AliIntensity) =>
      Math.max(...(resolveAliRig('EXCITED', 'PERCHED', i).layers[0].keys.hop as number[]));
    expect(peak(0)).toBeLessThan(peak(3));
    expect(peak(3)).toBeLessThan(peak(5));
    expect(INTENSITY_AMPLITUDE[3]).toBe(1);
  });

  it('only celebrates (sparkles, glow) at tier 3+ for happy expressions or celebratory poses', () => {
    expect(resolveAliRig('TRIUMPHANT', 'WING_SPREAD_FULL', 2).sparkles).toBe(0);
    expect(resolveAliRig('TRIUMPHANT', 'WING_SPREAD_FULL', 5).sparkles).toBeGreaterThan(0);
    expect(resolveAliRig('TRIUMPHANT', 'WING_SPREAD_FULL', 5).glow).toBeGreaterThan(0);
    expect(resolveAliRig('DISAPPOINTED', 'PERCHED', 5).sparkles).toBe(0);
    expect(resolveAliRig('CONCERNED', 'CONCERN_DROP', 5).glow).toBe(0);
  });

  it('shows the far wing whenever the wings open, and keeps flight airborne with tucked legs', () => {
    expect(resolveAliRig('NEUTRAL', 'PERCHED', 0).farWing).toBe(false);
    expect(resolveAliRig('NEUTRAL', 'WING_SPREAD_FULL', 0).farWing).toBe(true);
    const flight = resolveAliRig('NEUTRAL', 'FLIGHT', 3).channels;
    expect(flight.hop).toBeGreaterThan(20);
    expect(flight.legs).toBe(0);
  });

  it('dims the rune for the sad expressions and lights it for the big ones', () => {
    const rune = (e: AliExpression) => resolveAliRig(e, 'PERCHED', 2).channels.rune;
    expect(rune('DISAPPOINTED')).toBeLessThan(rune('NEUTRAL'));
    expect(rune('CONCERNED')).toBeLessThan(rune('NEUTRAL'));
    expect(rune('TRIUMPHANT')).toBeGreaterThan(rune('NEUTRAL'));
    expect(rune('SURPRISED')).toBeGreaterThan(rune('NEUTRAL'));
  });
});
