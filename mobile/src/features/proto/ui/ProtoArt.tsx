import { useUid } from './useUid';
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
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Code-drawn key art for the prototype's game tiles and headers
 * (ScrambleQuest letter cubes, Word Duel crossed swords, Complete It
 * scroll + quill, Boss Battle demon, trophy, treasure chest, crown).
 * Every piece is plain SVG so it scales crisply and themes with the app.
 */
export type ArtKind = 'scramble' | 'duel' | 'complete' | 'boss' | 'frost' | 'shadow' | 'titan';

function Sword({ rotate, blade, guard }: { rotate: number; blade: string; guard: string }) {
  return (
    <G transform={`rotate(${rotate} 60 45)`}>
      <Polygon points="57,6 63,6 64,58 60,64 56,58" fill={blade} />
      <Rect x={59.2} y={8} width={1.6} height={50} fill="#FFFFFF" opacity={0.55} />
      <Rect x={46} y={58} width={28} height={5} rx={2.5} fill={guard} />
      <Rect x={58} y={63} width={4} height={14} rx={2} fill="#6B3B1E" />
      <Circle cx={60} cy={79} r={4} fill={guard} />
    </G>
  );
}

function Cube({ x, y, rot, letter, tone }: { x: number; y: number; rot: number; letter: string; tone: [string, string] }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rot})`}>
      <Rect x={-17} y={-17} width={34} height={34} rx={7} fill={tone[1]} />
      <Rect x={-17} y={-17} width={34} height={29} rx={7} fill={tone[0]} />
      <Rect x={-14} y={-14} width={28} height={8} rx={4} fill="#FFFFFF" opacity={0.28} />
      <Path d={LETTERS[letter] ?? LETTERS.R} fill="#FFFFFF" transform="translate(-8 -9) scale(0.8)" />
    </G>
  );
}

// Tiny block-letter glyphs on a 20x22 grid.
const LETTERS: Record<string, string> = {
  R: 'M2,0 h10 a6,6 0 0 1 2,11.6 l5,10.4 h-5 l-4.4,-9.6 h-3.6 v9.6 h-4 z M6,3.6 v5 h5 a2.5,2.5 0 0 0 0,-5 z',
  D: 'M2,0 h8 a10,10 0 0 1 0,22 h-8 z M6,4 v14 h4 a6,7 0 0 0 0,-14 z',
  K: 'M2,0 h4 v9 l8,-9 h5 l-9,10 l10,12 h-5 l-9,-10.4 v10.4 h-4 z',
  A: 'M10,0 h3 l8,22 h-4.4 l-1.6,-4.6 h-7.6 l-1.6,4.6 h-4.4 z M11.4,5.4 l-2.6,7.6 h5.2 z',
  B: 'M2,0 h10 a5.4,5.4 0 0 1 2.6,10.2 a6,6 0 0 1 -2,11.8 h-10.6 z M6,3.6 v5 h5 a2.5,2.5 0 0 0 0,-5 z M6,12.4 v6 h5.4 a3,3 0 0 0 0,-6 z',
  O: 'M10,0 a9,11 0 1 1 0,22 a9,11 0 1 1 0,-22 z M10,4 a5,7 0 1 0 0,14 a5,7 0 1 0 0,-14 z',
  F: 'M2,0 h15 v4 h-11 v5 h9 v4 h-9 v9 h-4 z',
};

export function ArcadeArt({ kind, width = 120, height = 90, style }: { kind: ArtKind; width?: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const uid = useUid();
  // Wider-than-4:3 tiles reveal extra sky/ground at the sides instead of
  // cropping the art vertically; taller tiles crop the sides.
  const ratio = width / height;
  const vbW = Math.max(120, 90 * ratio);
  return (
    <View style={[{ width, height, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%" viewBox={`${60 - vbW / 2} 0 ${vbW} 90`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={BG[kind][0]} />
            <Stop offset="1" stopColor={BG[kind][1]} />
          </LinearGradient>
          <RadialGradient id={`gl-${uid}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={BG[kind][2]} stopOpacity="0.9" />
            <Stop offset="1" stopColor={BG[kind][2]} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x={-300} width={720} height={90} fill={`url(#bg-${uid})`} />
        <Circle cx={60} cy={44} r={52} fill={`url(#gl-${uid})`} />
        {kind === 'scramble' && (
          <G>
            <Path d="M0,72 C20,60 40,66 60,58 C80,66 100,58 120,70 L120,90 L0,90 Z" fill="#0B3B1F" opacity={0.7} />
            <Cube x={34} y={52} rot={-14} letter="R" tone={['#3B82F6', '#1D4ED8']} />
            <Cube x={64} y={38} rot={8} letter="D" tone={['#38BDF8', '#0284C7']} />
            <Cube x={92} y={56} rot={-6} letter="K" tone={['#60A5FA', '#2563EB']} />
            <Circle cx={22} cy={22} r={2} fill="#FFFFFF" opacity={0.8} />
            <Circle cx={100} cy={16} r={1.6} fill="#FFFFFF" opacity={0.7} />
          </G>
        )}
        {kind === 'duel' && (
          <G>
            <Path d="M0,76 L0,90 L120,90 L120,76 L100,70 L86,76 L60,64 L34,76 L20,70 Z" fill="#2A0F44" opacity={0.85} />
            <Sword rotate={-38} blade="#D7E3F4" guard="#F2C14E" />
            <Sword rotate={38} blade="#E8EEF8" guard="#F2C14E" />
            <Circle cx={60} cy={42} r={6} fill="#FFE29A" opacity={0.9} />
            <Path d="M60,30 L62,40 L72,42 L62,44 L60,54 L58,44 L48,42 L58,40 Z" fill="#FFFFFF" opacity={0.9} />
          </G>
        )}
        {kind === 'complete' && (
          <G>
            <Path d="M26,26 C26,20 34,20 40,22 L98,22 C104,22 106,28 102,32 L98,70 C98,76 92,78 86,76 L36,76 C28,76 24,72 26,66 Z" fill="#F3DFAE" />
            <Path d="M26,26 C20,26 18,34 24,36 L28,36" fill="none" stroke="#C99A4B" strokeWidth={2} />
            {[34, 42, 50, 58, 66].map((ly) => (
              <Rect key={ly} x={38} y={ly} width={ly === 66 ? 28 : 52} height={2.6} rx={1.3} fill="#9B7536" opacity={0.7} />
            ))}
            <Path d="M96,10 C108,18 106,40 84,62 L82,56 C94,40 98,26 96,10 Z" fill="#3B6FE0" />
            <Path d="M96,10 C100,30 92,46 82,56" fill="none" stroke="#DCE8FF" strokeWidth={1.2} opacity={0.8} />
            <Polygon points="82,56 84,62 79,70" fill="#2C2C2C" />
          </G>
        )}
        {(kind === 'boss' || kind === 'titan' || kind === 'shadow' || kind === 'frost') && <BossHead kind={kind} />}
      </Svg>
    </View>
  );
}

const BG: Record<ArtKind, [string, string, string]> = {
  scramble: ['#14683A', '#0A2D5E', '#7EE0FF'],
  duel: ['#4C1D95', '#1B0B3B', '#C084FC'],
  complete: ['#B45309', '#5A2A06', '#FFD27A'],
  boss: ['#7A1308', '#1A0504', '#FF6A2A'],
  frost: ['#2F6DB8', '#0A1F45', '#BDEBFF'],
  shadow: ['#3B1A6B', '#0B0420', '#B58CFF'],
  titan: ['#1F6B3A', '#06210F', '#9CFF8A'],
};

function BossHead({ kind }: { kind: ArtKind }) {
  const skin = kind === 'boss' ? '#3A0E0A' : kind === 'frost' ? '#9FD2F0' : kind === 'shadow' ? '#2B1450' : '#27502E';
  const eye = kind === 'boss' ? '#FFB347' : kind === 'frost' ? '#FFFFFF' : kind === 'shadow' ? '#E1C6FF' : '#E8FF8A';
  return (
    <G>
      <Path d="M30,50 L20,14 L42,34 Z" fill={skin} />
      <Path d="M90,50 L100,14 L78,34 Z" fill={skin} />
      <Path d="M24,48 C24,26 42,16 60,16 C78,16 96,26 96,48 C96,70 80,84 60,86 C40,84 24,70 24,48 Z" fill={skin} />
      <Path d="M36,48 L52,54 L50,60 Z" fill={eye} />
      <Path d="M84,48 L68,54 L70,60 Z" fill={eye} />
      <Ellipse cx={44} cy={53} rx={3.4} ry={2} fill="#FFFFFF" opacity={0.7} />
      <Ellipse cx={76} cy={53} rx={3.4} ry={2} fill="#FFFFFF" opacity={0.7} />
      <Path d="M44,72 L50,66 L56,74 L60,66 L64,74 L70,66 L76,72 L70,80 L50,80 Z" fill="#0A0505" opacity={0.85} />
      {[48, 56, 64, 72].map((tx) => (
        <Polygon key={tx} points={`${tx - 2},72 ${tx + 2},72 ${tx},77`} fill="#F4EBD8" />
      ))}
    </G>
  );
}

// ---------------------------------------------------------------------------

export function TrophyArt({ size = 72 }: { size?: number }) {
  const uid = useUid();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`trophy-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE38A" />
          <Stop offset="1" stopColor="#D9961E" />
        </LinearGradient>
      </Defs>
      <Path d="M28,14 h44 v24 a22,22 0 0 1 -44,0 z" fill={`url(#trophy-${uid})`} />
      <Path d="M28,20 C10,20 10,44 30,46" fill="none" stroke="#F2C14E" strokeWidth={5} />
      <Path d="M72,20 C90,20 90,44 70,46" fill="none" stroke="#F2C14E" strokeWidth={5} />
      <Rect x={44} y={58} width={12} height={14} fill="#D9961E" />
      <Rect x={32} y={72} width={36} height={10} rx={3} fill="#B77A12" />
      <Path d="M50,20 l3.6,7.6 8.4,1 -6.2,5.8 1.6,8.4 -7.4,-4.2 -7.4,4.2 1.6,-8.4 -6.2,-5.8 8.4,-1 z" fill="#FFF6D0" opacity={0.9} />
    </Svg>
  );
}

export function CrownArt({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 80 60">
      <Path d="M6,50 L2,14 L22,30 L40,6 L58,30 L78,14 L74,50 Z" fill="#F4B63A" />
      <Path d="M6,50 L74,50 L72,56 L8,56 Z" fill="#C9861A" />
      <Circle cx={40} cy={10} r={4} fill="#FFE9A8" />
      <Circle cx={4} cy={14} r={3.4} fill="#FFE9A8" />
      <Circle cx={76} cy={14} r={3.4} fill="#FFE9A8" />
      <Circle cx={40} cy={38} r={4} fill="#E04B4B" />
      <Circle cx={22} cy={42} r={3} fill="#3BA3E8" />
      <Circle cx={58} cy={42} r={3} fill="#3BA3E8" />
    </Svg>
  );
}

export function ChestArt({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 100 80">
      <Rect x={8} y={30} width={84} height={44} rx={6} fill="#8B4A1E" />
      <Path d="M8,34 C8,10 92,10 92,34 Z" fill="#B8641F" />
      <Rect x={8} y={38} width={84} height={8} fill="#F2C14E" />
      <Rect x={44} y={34} width={12} height={20} rx={3} fill="#F2C14E" />
      <Circle cx={50} cy={44} r={3} fill="#5A2A0E" />
      <Circle cx={30} cy={22} r={2} fill="#FFE9A8" />
      <Circle cx={74} cy={26} r={1.6} fill="#FFE9A8" />
    </Svg>
  );
}

export function GiftArt({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Rect x={8} y={24} width={44} height={30} rx={4} fill="#C026D3" />
      <Rect x={5} y={16} width={50} height={12} rx={3} fill="#E879F9" />
      <Rect x={27} y={16} width={6} height={38} fill="#FDE68A" />
      <Path d="M30,16 C20,2 10,10 22,16 Z M30,16 C40,2 50,10 38,16 Z" fill="#FDE68A" />
    </Svg>
  );
}
