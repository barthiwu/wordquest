import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Polygon,
} from 'react-native-svg';
import { useThemeStore } from '@/state/themeStore';

/**
 * Code-drawn illustrated scenes for the prototype "New look" — layered
 * vector landscapes (sky + glow, far ridge, a landmark, hills, pines,
 * foreground foliage) with gently drifting clouds and fireflies/embers.
 * Everything is procedural (seeded, so a scene is identical on every
 * render) — no bitmap assets. Each of the nine Journey worlds plus the
 * boss/arena settings has its own scene, in a dark (dusk/night) and a
 * light (daytime) composition.
 */
export type SceneVariant =
  | 'forest'
  | 'hamlet'
  | 'village'
  | 'mountain'
  | 'castle'
  | 'city'
  | 'town'
  | 'kingdom'
  | 'legend'
  | 'inferno'
  | 'frost'
  | 'shadow'
  | 'arena';

interface ScenePalette {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  glow: string;
  glowAt: [number, number];
  far: string;
  mid: string;
  near: string;
  foliage: string;
  light: string; // lit windows / lava / lanterns
  cloud: string;
  stars: boolean;
}

type PaletteSet = { dark: ScenePalette; light: ScenePalette };

const mk = (p: Partial<ScenePalette> & Pick<ScenePalette, 'skyTop' | 'skyMid' | 'skyBottom' | 'far' | 'mid' | 'near' | 'foliage'>): ScenePalette => ({
  glow: '#FFD9A0',
  glowAt: [300, 130],
  light: '#FFD27A',
  cloud: 'rgba(255,255,255,0.14)',
  stars: false,
  ...p,
});

const PALETTES: Record<SceneVariant, PaletteSet> = {
  forest: {
    dark: mk({ skyTop: '#0A1A3C', skyMid: '#2B5A96', skyBottom: '#F2A66C', far: '#2C5083', mid: '#1B4B52', near: '#0F3322', foliage: '#08241A', stars: true }),
    light: mk({ skyTop: '#59A7F0', skyMid: '#A6D6FF', skyBottom: '#FFEBC9', glow: '#FFF7DC', far: '#85AFDB', mid: '#62A872', near: '#348049', foliage: '#206037', cloud: 'rgba(255,255,255,0.7)' }),
  },
  hamlet: {
    dark: mk({ skyTop: '#1A1442', skyMid: '#6A3B7C', skyBottom: '#FF9D5C', glowAt: [110, 150], far: '#4B3A7A', mid: '#3A2F5E', near: '#1F2A3C', foliage: '#101A2C', stars: true }),
    light: mk({ skyTop: '#7DB9F7', skyMid: '#C4E2FF', skyBottom: '#FFE2BC', glow: '#FFF3CF', far: '#9BB7DE', mid: '#79B07A', near: '#4B8C52', foliage: '#2E6A3A', cloud: 'rgba(255,255,255,0.7)' }),
  },
  village: {
    dark: mk({ skyTop: '#101640', skyMid: '#4B3C8C', skyBottom: '#FF8B5A', glowAt: [320, 160], far: '#473E88', mid: '#2E3568', near: '#1B2347', foliage: '#10172E', stars: true }),
    light: mk({ skyTop: '#6FB0F4', skyMid: '#BDDFFF', skyBottom: '#FFE5BF', glow: '#FFF3CF', far: '#98B6E0', mid: '#7DB27F', near: '#52915A', foliage: '#33703F', cloud: 'rgba(255,255,255,0.72)' }),
  },
  mountain: {
    dark: mk({ skyTop: '#07163A', skyMid: '#2E5B91', skyBottom: '#BBDFFF', glow: '#E6F3FF', glowAt: [90, 120], far: '#6F95C4', mid: '#3E618F', near: '#1D3A63', foliage: '#0E2342', stars: true }),
    light: mk({ skyTop: '#4F9DEB', skyMid: '#9ACDFB', skyBottom: '#EAF6FF', glow: '#FFFFFF', far: '#A9C7E8', mid: '#6F98C6', near: '#4777A8', foliage: '#2C5C8A', cloud: 'rgba(255,255,255,0.8)' }),
  },
  castle: {
    dark: mk({ skyTop: '#0A1030', skyMid: '#3F3180', skyBottom: '#E58A6B', glowAt: [250, 140], far: '#3D3C7D', mid: '#2A2D61', near: '#161A3B', foliage: '#0D1128', stars: true }),
    light: mk({ skyTop: '#6AAEF2', skyMid: '#B7DAFF', skyBottom: '#FFE3C2', glow: '#FFF4D4', far: '#9DB6DD', mid: '#7FA9D0', near: '#5A8E5C', foliage: '#376E41', cloud: 'rgba(255,255,255,0.75)' }),
  },
  city: {
    dark: mk({ skyTop: '#0D1033', skyMid: '#5B3A92', skyBottom: '#FF7FAE', glowAt: [200, 170], far: '#4F3F8C', mid: '#2F2A66', near: '#171638', foliage: '#0C0C26', stars: true, light: '#FFE08A' }),
    light: mk({ skyTop: '#76B5F5', skyMid: '#C3DFFF', skyBottom: '#FFD9D0', glow: '#FFF0D6', far: '#A5B8DD', mid: '#8197C4', near: '#5B73A3', foliage: '#3A5380', cloud: 'rgba(255,255,255,0.75)' }),
  },
  town: {
    dark: mk({ skyTop: '#0E1740', skyMid: '#34508F', skyBottom: '#FFB470', glowAt: [150, 160], far: '#3C558F', mid: '#2A4577', near: '#16294A', foliage: '#0C1B33', stars: true }),
    light: mk({ skyTop: '#6AB1F5', skyMid: '#B9DDFF', skyBottom: '#FFE6C4', glow: '#FFF3D0', far: '#96B8E0', mid: '#7FAAD2', near: '#5B9366', foliage: '#3A7348', cloud: 'rgba(255,255,255,0.75)' }),
  },
  kingdom: {
    dark: mk({ skyTop: '#1B0F38', skyMid: '#7A3E8A', skyBottom: '#FFB45F', glowAt: [280, 150], far: '#6A3F8E', mid: '#4B2F6E', near: '#26183F', foliage: '#150C2A', stars: true, light: '#FFD36B' }),
    light: mk({ skyTop: '#86B7F6', skyMid: '#D3E6FF', skyBottom: '#FFE0B8', glow: '#FFF1CB', far: '#B7B4DE', mid: '#9A92C6', near: '#6F9A63', foliage: '#487B46', cloud: 'rgba(255,255,255,0.78)' }),
  },
  legend: {
    dark: mk({ skyTop: '#13093A', skyMid: '#5A2E9C', skyBottom: '#FF8CC8', glowAt: [250, 110], far: '#5B38A0', mid: '#3E2A7C', near: '#201552', foliage: '#110B33', stars: true, light: '#E9C8FF' }),
    light: mk({ skyTop: '#8AA9F5', skyMid: '#D3D8FF', skyBottom: '#FFDDF0', glow: '#FFF7FF', far: '#B4B0E6', mid: '#9A8FD0', near: '#7A71BB', foliage: '#5A52A0', cloud: 'rgba(255,255,255,0.8)' }),
  },
  inferno: {
    dark: mk({ skyTop: '#190404', skyMid: '#6E1708', skyBottom: '#FF5B20', glow: '#FF9A3D', glowAt: [200, 190], far: '#4A1209', mid: '#2F0B07', near: '#1A0604', foliage: '#0C0302', light: '#FF7A2A', cloud: 'rgba(255,120,60,0.16)' }),
    light: mk({ skyTop: '#7A2A18', skyMid: '#D2582C', skyBottom: '#FFB36B', glow: '#FFE0A0', glowAt: [200, 190], far: '#9A3F24', mid: '#6E2C1A', near: '#4A1D12', foliage: '#2D100A', light: '#FF8A3A', cloud: 'rgba(255,200,150,0.35)' }),
  },
  frost: {
    dark: mk({ skyTop: '#06142F', skyMid: '#2D5C99', skyBottom: '#BFE6FF', glow: '#E8F7FF', glowAt: [300, 110], far: '#7EA6D3', mid: '#4C74A6', near: '#254768', foliage: '#102A44', stars: true, light: '#CFF0FF' }),
    light: mk({ skyTop: '#62A8EE', skyMid: '#B2D9FF', skyBottom: '#F0F9FF', glow: '#FFFFFF', far: '#B5D0EA', mid: '#85ADD3', near: '#5E8AB5', foliage: '#3F6B94', cloud: 'rgba(255,255,255,0.85)' }),
  },
  shadow: {
    dark: mk({ skyTop: '#0A0518', skyMid: '#2B1650', skyBottom: '#7A3FB5', glow: '#B58CFF', glowAt: [260, 120], far: '#34195E', mid: '#24124A', near: '#150A30', foliage: '#08041A', stars: true, light: '#C79BFF' }),
    light: mk({ skyTop: '#5B4A9A', skyMid: '#9A7ED0', skyBottom: '#E3C9F5', glow: '#F7EAFF', far: '#7C62B4', mid: '#5E4796', near: '#43307A', foliage: '#2C1D58', light: '#EBD3FF', cloud: 'rgba(255,255,255,0.5)' }),
  },
  arena: {
    dark: mk({ skyTop: '#10081F', skyMid: '#4A1B58', skyBottom: '#D8553A', glowAt: [200, 170], far: '#4A2063', mid: '#331547', near: '#1B0B2B', foliage: '#0D0518', stars: true, light: '#FF9B4A' }),
    light: mk({ skyTop: '#7A5BB0', skyMid: '#C28BCB', skyBottom: '#FFC59A', glow: '#FFEBC9', far: '#9C6BB5', mid: '#7A4F99', near: '#5A3578', foliage: '#3A2152', light: '#FFB05A', cloud: 'rgba(255,255,255,0.5)' }),
  },
};

// ---------------------------------------------------------------------------
// Seeded RNG + path helpers

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 300;

/** Smooth ridge silhouette filled down to the bottom edge. */
function ridge(seed: number, baseY: number, amp: number, steps = 9): string {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    pts.push([(i / steps) * W, baseY - r() * amp]);
  }
  let d = `M0,${H} L${pts[0][0]},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const cx = (px + x) / 2;
    d += ` Q${px + (x - px) * 0.5},${py.toFixed(1)} ${cx.toFixed(1)},${((py + y) / 2).toFixed(1)}`;
    d += ` T${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d} L${W},${H} Z`;
}

/** Sharp snow-capped peaks. */
function peaks(seed: number, baseY: number, amp: number, count: number): { body: string; caps: string[] } {
  const r = rng(seed);
  let body = `M0,${H} L0,${baseY}`;
  const caps: string[] = [];
  const step = W / count;
  for (let i = 0; i < count; i += 1) {
    const x0 = i * step;
    const px = x0 + step * (0.35 + r() * 0.3);
    const py = baseY - amp * (0.55 + r() * 0.45);
    body += ` L${px.toFixed(1)},${py.toFixed(1)} L${(x0 + step).toFixed(1)},${baseY}`;
    const capH = (baseY - py) * 0.28;
    caps.push(`M${px.toFixed(1)},${py.toFixed(1)} L${(px - capH * 0.55).toFixed(1)},${(py + capH).toFixed(1)} L${(px - capH * 0.15).toFixed(1)},${(py + capH * 0.8).toFixed(1)} L${(px + capH * 0.2).toFixed(1)},${(py + capH).toFixed(1)} L${(px + capH * 0.55).toFixed(1)},${(py + capH * 0.95).toFixed(1)} Z`);
  }
  return { body: `${body} L${W},${H} Z`, caps };
}

interface Pine {
  x: number;
  y: number;
  s: number;
}

function pineField(seed: number, count: number, minY: number, maxY: number, scale: number): Pine[] {
  const r = rng(seed);
  const list: Pine[] = [];
  for (let i = 0; i < count; i += 1) {
    list.push({ x: r() * W, y: minY + r() * (maxY - minY), s: scale * (0.7 + r() * 0.6) });
  }
  return list.sort((a, b) => a.y - b.y);
}

function pinePath(p: Pine): string {
  const { x, y, s } = p;
  const tier = (cy: number, w: number, h: number) => `M${x},${cy - h} L${x + w},${cy} L${x - w},${cy} Z`;
  return (
    tier(y - 14 * s, 7 * s, 16 * s) +
    tier(y - 6 * s, 10 * s, 16 * s) +
    tier(y + 2 * s, 13 * s, 16 * s) +
    `M${x - 1.6 * s},${y + 2 * s} h${3.2 * s} v${6 * s} h${-3.2 * s} Z`
  );
}

// ---------------------------------------------------------------------------
// Landmarks

function Castle({ x, y, s, body, roof, light }: { x: number; y: number; s: number; body: string; roof: string; light: string }) {
  const wins: [number, number][] = [
    [-6, -34],
    [8, -34],
    [-30, -20],
    [30, -22],
    [0, -52],
  ];
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {/* walls */}
      <Rect x={-42} y={-30} width={84} height={30} fill={body} />
      {/* keep */}
      <Rect x={-14} y={-62} width={28} height={62} fill={body} />
      <Polygon points="-18,-62 0,-92 18,-62" fill={roof} />
      {/* side towers */}
      <Rect x={-50} y={-48} width={16} height={48} fill={body} />
      <Polygon points="-54,-48 -42,-72 -30,-48" fill={roof} />
      <Rect x={34} y={-52} width={16} height={52} fill={body} />
      <Polygon points="30,-52 42,-78 54,-52" fill={roof} />
      {/* flag */}
      <Rect x={-0.8} y={-108} width={1.6} height={16} fill={body} />
      <Polygon points="0.8,-108 12,-104 0.8,-100" fill={light} />
      {/* battlements */}
      {[-38, -28, -18, 18, 28, 38].map((bx) => (
        <Rect key={bx} x={bx} y={-35} width={6} height={6} fill={body} />
      ))}
      {wins.map(([wx, wy], i) => (
        <Rect key={i} x={wx - 2} y={wy} width={4} height={8} rx={2} fill={light} opacity={0.9} />
      ))}
      {/* gate */}
      <Path d="M-6,0 L-6,-10 A6,6 0 0 1 6,-10 L6,0 Z" fill={light} opacity={0.55} />
    </G>
  );
}

function Houses({ x, y, s, body, roof, light, seed }: { x: number; y: number; s: number; body: string; roof: string; light: string; seed: number }) {
  const r = rng(seed);
  const items = [-70, -30, 12, 52, 90].map((hx, i) => ({ hx, w: 26 + r() * 10, h: 20 + r() * 14, i }));
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {items.map(({ hx, w, h, i }) => (
        <G key={i}>
          <Rect x={hx} y={-h} width={w} height={h} fill={body} />
          <Polygon points={`${hx - 4},${-h} ${hx + w / 2},${-h - 16} ${hx + w + 4},${-h}`} fill={roof} />
          <Rect x={hx + w * 0.3} y={-h * 0.62} width={5} height={7} rx={1} fill={light} opacity={0.95} />
          <Rect x={hx + w * 0.62} y={-h * 0.62} width={5} height={7} rx={1} fill={light} opacity={0.8} />
          {i % 2 === 0 && <Rect x={hx + w - 6} y={-h - 22} width={4} height={10} fill={body} />}
        </G>
      ))}
    </G>
  );
}

function Skyline({ seed, y, body, light }: { seed: number; y: number; body: string; light: string }) {
  const r = rng(seed);
  const blocks: ReactNode[] = [];
  let x = -10;
  let i = 0;
  while (x < W + 10) {
    const w = 18 + r() * 22;
    const h = 40 + r() * 90;
    blocks.push(<Rect key={`b${i}`} x={x} y={y - h} width={w} height={h} fill={body} />);
    const cols = Math.floor(w / 8);
    const rows = Math.floor(h / 12);
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (r() > 0.6) blocks.push(<Rect key={`w${i}-${cx}-${cy}`} x={x + 3 + cx * 8} y={y - h + 5 + cy * 12} width={3.4} height={5} fill={light} opacity={0.85} />);
      }
    }
    x += w + 2;
    i += 1;
  }
  return <G>{blocks}</G>;
}

function Volcano({ x, y, s, body, lava }: { x: number; y: number; s: number; body: string; lava: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Polygon points="-120,0 -22,-110 22,-110 120,0" fill={body} />
      <Path d="M-22,-110 C-10,-96 -14,-70 -4,-40 C0,-24 -8,-12 -6,0 L10,0 C14,-22 8,-46 14,-70 C18,-88 22,-100 22,-110 Z" fill={lava} opacity={0.9} />
      <Ellipse cx={0} cy={-110} rx={22} ry={5} fill={lava} />
      <Circle cx={0} cy={-118} r={26} fill={lava} opacity={0.18} />
    </G>
  );
}

function Banners({ y, body, accent }: { y: number; body: string; accent: string }) {
  return (
    <G>
      {[40, 130, 270, 360].map((bx, i) => (
        <G key={bx}>
          <Rect x={bx - 2} y={y - 120} width={4} height={120} fill={body} />
          <Path d={`M${bx + 2},${y - 116} h26 v46 l-13,-9 l-13,9 Z`} fill={accent} opacity={i % 2 ? 0.7 : 0.9} />
        </G>
      ))}
      <Path d={`M120,${y} L120,${y - 54} L135,${y - 54} L135,${y - 40} L150,${y - 40} L150,${y - 54} L165,${y - 54} L165,${y - 40} L180,${y - 40} L180,${y - 54} L220,${y - 54} L220,${y - 40} L235,${y - 40} L235,${y - 54} L250,${y - 54} L250,${y - 40} L265,${y - 40} L265,${y - 54} L280,${y - 54} L280,${y} Z`} fill={body} />
    </G>
  );
}

function FloatingIsland({ x, y, s, body, light }: { x: number; y: number; s: number; body: string; light: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M-70,0 C-60,-6 60,-6 70,0 C50,30 20,50 0,70 C-20,50 -50,30 -70,0 Z" fill={body} />
      <Castle x={0} y={-4} s={0.8} body={body} roof={light} light={light} />
      <Circle cx={0} cy={-60} r={50} fill={light} opacity={0.1} />
    </G>
  );
}

function renderLandmark(variant: SceneVariant, p: ScenePalette): ReactNode {
  switch (variant) {
    case 'forest':
      return <Castle x={290} y={196} s={0.62} body={p.far} roof={p.far} light={p.light} />;
    case 'castle':
      return <Castle x={255} y={206} s={1.05} body={p.mid} roof={p.near} light={p.light} />;
    case 'hamlet':
      return <Houses x={170} y={214} s={0.9} body={p.mid} roof={p.near} light={p.light} seed={11} />;
    case 'village':
      return <Houses x={210} y={216} s={1.05} body={p.mid} roof={p.near} light={p.light} seed={21} />;
    case 'town':
      return <Houses x={200} y={216} s={1.12} body={p.mid} roof={p.foliage} light={p.light} seed={33} />;
    case 'city':
      return <Skyline seed={7} y={226} body={p.mid} light={p.light} />;
    case 'kingdom':
      return <Castle x={290} y={214} s={1.15} body={p.mid} roof={p.light} light={p.light} />;
    case 'legend':
      return <FloatingIsland x={270} y={110} s={1.05} body={p.mid} light={p.light} />;
    case 'inferno':
      return <Volcano x={250} y={214} s={1.35} body={p.mid} lava={p.light} />;
    case 'shadow':
      return <Castle x={265} y={208} s={1.0} body={p.mid} roof={p.near} light={p.light} />;
    case 'arena':
      return <Banners y={226} body={p.mid} accent={p.light} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Drifting layers

function Drift({ children, seconds, y, h, reverse }: { children: ReactNode; seconds: number; y: number; h: number; reverse?: boolean }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!w) return undefined;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [w, seconds, x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-w, 0] : [0, -w] });
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: y, height: h }]} onLayout={onLayout}>
      <Animated.View style={{ width: w * 2, height: h, transform: [{ translateX }], flexDirection: 'row' }}>
        <View style={{ width: w, height: h }}>{children}</View>
        <View style={{ width: w, height: h }}>{children}</View>
      </Animated.View>
    </View>
  );
}

function Clouds({ color, seed }: { color: string; seed: number }) {
  const r = rng(seed);
  const puffs = Array.from({ length: 4 }, (_, i) => ({ cx: 40 + i * 100 + r() * 40, cy: 20 + r() * 50, rx: 40 + r() * 28, ry: 8 + r() * 6 }));
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 100" preserveAspectRatio="none">
      {puffs.map((c, i) => (
        <G key={i}>
          <Ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={color} />
          <Ellipse cx={c.cx - c.rx * 0.4} cy={c.cy + 3} rx={c.rx * 0.6} ry={c.ry * 0.9} fill={color} />
        </G>
      ))}
    </Svg>
  );
}

function Sparkles({ color, count, seed, h, embers }: { color: string; count: number; seed: number; h: number; embers?: boolean }) {
  const r = useMemo(() => {
    const g = rng(seed);
    return Array.from({ length: count }, () => ({ x: g(), y: g(), size: 1.6 + g() * 2.2, delay: g() * 3000, dur: 2400 + g() * 2600 }));
  }, [count, seed]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height: h }]}>
      {r.map((s, i) => (
        <Spark key={i} color={color} {...s} embers={embers} h={h} />
      ))}
    </View>
  );
}

function Spark({ color, x, y, size, delay, dur, embers, h }: { color: string; x: number; y: number; size: number; delay: number; dur: number; embers?: boolean; h: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, dur]);
  const opacity = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.95, 0] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, embers ? -h * 0.25 : -8] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${(0.45 + y * 0.5) * 100}%`,
        width: size * 2,
        height: size * 2,
        borderRadius: size,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
        shadowColor: color,
        shadowOpacity: 0.9,
        shadowRadius: 5,
      }}
    />
  );
}

// ---------------------------------------------------------------------------

export interface SceneBackdropProps {
  variant?: SceneVariant;
  /** Pixel height of the scene area. */
  height?: number;
  /** Draw a mossy perch rock bottom-left for ALI to sit on. */
  perch?: boolean;
  /** Fade the bottom edge into this color so content below blends in. */
  fadeTo?: string;
  /** Run the clouds / fireflies animation (default true). */
  animated?: boolean;
  /** Draw this time of day regardless of the app theme (share cards are always night). */
  forceMode?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function SceneBackdropBase({ variant = 'forest', height = 240, perch, fadeTo, animated = true, forceMode, style, children }: SceneBackdropProps) {
  const themeMode = useThemeStore((s) => s.mode);
  const mode = forceMode ?? themeMode;
  const set = PALETTES[variant];
  const p = mode === 'light' ? set.light : set.dark;
  const uid = `${variant}-${mode}`;
  const seed = useMemo(() => variant.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 7), [variant]);
  const stars = useMemo(() => {
    const g = rng(seed + 5);
    return Array.from({ length: 34 }, () => ({ x: g() * W, y: g() * 120, r: 0.5 + g() * 1.1, o: 0.35 + g() * 0.6 }));
  }, [seed]);
  const mountain = variant === 'mountain' || variant === 'frost';
  const pk = useMemo(() => peaks(seed + 1, 205, 120, 4), [seed]);
  const pines = useMemo(() => pineField(seed + 2, 26, 205, 250, 0.95), [seed]);
  const nearPines = useMemo(() => pineField(seed + 3, 9, 258, 292, 1.5), [seed]);
  const hasTrees = variant !== 'city' && variant !== 'inferno' && variant !== 'arena' && variant !== 'legend';
  const embers = variant === 'inferno' || variant === 'arena';
  const ridgeFar = useMemo(() => ridge(seed + 11, 190, 55), [seed]);
  const ridgeMid = useMemo(() => ridge(seed + 12, 226, 36), [seed]);
  const ridgeNear = useMemo(() => ridge(seed + 13, 262, 26), [seed]);

  return (
    <View style={[{ height, overflow: 'hidden', backgroundColor: p.skyBottom }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.skyTop} />
            <Stop offset="0.55" stopColor={p.skyMid} />
            <Stop offset="1" stopColor={p.skyBottom} />
          </LinearGradient>
          <RadialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={p.glow} stopOpacity="0.95" />
            <Stop offset="0.35" stopColor={p.glow} stopOpacity="0.35" />
            <Stop offset="1" stopColor={p.glow} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id={`fog-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.far} stopOpacity="0" />
            <Stop offset="1" stopColor={p.far} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#sky-${uid})`} />
        {mode === 'dark' && p.stars && stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />)}
        <Circle cx={p.glowAt[0]} cy={p.glowAt[1]} r={150} fill={`url(#glow-${uid})`} />
        <Circle cx={p.glowAt[0]} cy={p.glowAt[1]} r={mode === 'dark' ? 16 : 20} fill={p.glow} opacity={variant === 'inferno' ? 0.5 : 0.9} />

        {mountain ? (
          <>
            <Path d={pk.body} fill={p.far} />
            {pk.caps.map((d, i) => (
              <Path key={i} d={d} fill="#F5FAFF" opacity={0.92} />
            ))}
          </>
        ) : (
          <Path d={ridgeFar} fill={p.far} />
        )}
        <Rect x={0} y={150} width={W} height={90} fill={`url(#fog-${uid})`} />
        {renderLandmark(variant, p)}
        <Path d={ridgeMid} fill={p.mid} />
        {hasTrees && pines.map((t, i) => <Path key={i} d={pinePath(t)} fill={p.mid} opacity={0.95} />)}
        <Path d={ridgeNear} fill={p.near} />
        {hasTrees && nearPines.map((t, i) => <Path key={i} d={pinePath(t)} fill={p.foliage} />)}
        {perch && (
          <G>
            <Path d="M-10,300 L-10,236 C20,226 70,224 112,232 C132,236 150,246 160,300 Z" fill={p.foliage} />
            <Path d="M-10,240 C20,230 70,228 112,236 C100,246 40,248 -10,252 Z" fill={p.near} opacity={0.9} />
            <Path d="M10,236 C40,230 80,230 108,238 C80,240 40,242 10,244 Z" fill={p.light} opacity={0.18} />
          </G>
        )}
        {/* foliage framing */}
        <Path d={`M0,0 L0,${H * 0.55} C30,${H * 0.45} 40,${H * 0.2} 24,0 Z`} fill={p.foliage} opacity={hasTrees ? 0.85 : 0} />
        <Path d={`M${W},0 L${W},${H * 0.5} C${W - 34},${H * 0.4} ${W - 40},${H * 0.15} ${W - 22},0 Z`} fill={p.foliage} opacity={hasTrees ? 0.85 : 0} />
      </Svg>

      {animated && (
        <>
          <Drift seconds={140} y={height * 0.04} h={height * 0.3}>
            <Clouds color={p.cloud} seed={seed + 21} />
          </Drift>
          <Drift seconds={90} y={height * 0.2} h={height * 0.22}>
            <Clouds color={p.cloud} seed={seed + 22} />
          </Drift>
          <Sparkles color={embers ? '#FF9A3D' : p.light} count={embers ? 12 : 8} seed={seed + 40} h={height} embers={embers} />
        </>
      )}

      {fadeTo ? (
        <Svg width="100%" height={Math.round(height * 0.28)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} preserveAspectRatio="none" viewBox="0 0 10 10">
          <Defs>
            <LinearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fadeTo} stopOpacity="0" />
              <Stop offset="1" stopColor={fadeTo} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="10" height="10" fill={`url(#fade-${uid})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

export const SceneBackdrop = memo(SceneBackdropBase);
