import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { AliCharacter } from '@/components/AliCharacter';
import { AvatarBubble } from '@/components/AvatarBubble';
import { TrophyArt } from '@/features/proto/ui/ProtoArt';
import { useUid } from '@/features/proto/ui/useUid';
import { Confetti } from './Confetti';
import { CardFooter, P, GOLD, placeColor, scoreText, timeText } from './shared';
import { CARD_HEIGHT, CARD_WIDTH, meOf, type ResultCardData } from './types';

/** Twelve soft rays fanning out behind the trophy. */
function Rays({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const uid = useUid('rays');
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a0 = (i / 14) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / 28;
    const pt = (a: number) => `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    return `M${cx},${cy} L${pt(a0)} L${pt(a1)} Z`;
  });
  return (
    <Svg width={CARD_WIDTH} height={360} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`${uid}g`} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.5} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}h`} cx={cx} cy={cy} r={120} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE9A8" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFE9A8" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={rays.join(' ')} fill={`url(#${uid}g)`} />
      <Path
        d={`M${cx - 120},${cy} a120,120 0 1,0 240,0 a120,120 0 1,0 -240,0`}
        fill={`url(#${uid}h)`}
      />
    </Svg>
  );
}

/** Option B — "Trophy Ceremony": the winner's portrait on a golden trophy, your own result below. */
export function TrophyCeremonyCard({ data }: { data: ResultCardData }) {
  const ranked = data.players.filter((p) => p.rank != null).sort((a, b) => a.rank! - b.rank!);
  const winner = ranked[0];
  const runnersUp = ranked.slice(1, 3);
  const me = meOf(data);
  const iWon = !!me && me.rank === 1;

  return (
    <View style={s.card}>
      <LinearGradient
        colors={['#2B2160', '#1A1540', P.background]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Rays cx={CARD_WIDTH / 2} cy={170} r={260} />
      <Confetti width={CARD_WIDTH} height={CARD_HEIGHT} count={42} seed={5} top={70} bottom={330} />

      <View style={s.top}>
        <Text style={s.eyebrow}>
          {data.gameLabel} · {data.title}
        </Text>
        <Text style={s.winnerLabel}>{data.winnerLabel}</Text>
      </View>

      <View style={s.trophyWrap}>
        <TrophyArt size={176} />
        {winner ? (
          <View style={s.medallion}>
            <View style={s.medallionRing}>
              <AvatarBubble
                colors={P}
                avatarUrl={winner.avatarUrl}
                username={winner.name}
                size={40}
              />
            </View>
          </View>
        ) : null}
      </View>

      {winner ? (
        <View style={s.plate}>
          <Text style={s.plateName} numberOfLines={1}>
            {winner.name}
          </Text>
          <Text style={s.plateScore}>
            {scoreText(winner)}
            {timeText(winner) ? `  ·  ${timeText(winner)}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={s.panel}>
        <View style={s.ali}>
          <AliCharacter
            size={86}
            framing="bust"
            animated={false}
            expression={data.aliExpression}
            pose={data.aliPose}
            intensity={data.aliIntensity}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.youLabel}>{data.youLabel}</Text>
          <Text style={[s.rank, { color: placeColor(me?.rank ?? null) }]}>
            #{me?.rank ?? '–'}
            <Text style={s.of}> {data.ofPlayers}</Text>
          </Text>
          <Text style={s.score}>
            {me ? scoreText(me) : ''}
            {me && timeText(me) ? `  ·  ${timeText(me)}` : ''}
          </Text>
          {iWon ? null : <Text style={s.msg}>{data.aliMessage}</Text>}
        </View>
      </View>

      <View style={s.runners}>
        {runnersUp.map((p) => (
          <View key={p.id} style={s.runner}>
            <Text style={[s.runnerRank, { color: placeColor(p.rank) }]}>#{p.rank}</Text>
            <Text style={s.runnerName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={s.runnerScore}>{scoreText(p)}</Text>
          </View>
        ))}
      </View>

      <View style={s.foot}>
        <CardFooter footer={data.footer} brand={data.brand} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: P.background,
    overflow: 'hidden',
    borderRadius: 24,
  },
  top: { position: 'absolute', top: 20, left: 20, right: 20, alignItems: 'center', gap: 6 },
  eyebrow: {
    color: P.arcaneSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  winnerLabel: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  trophyWrap: { position: 'absolute', top: 76, left: 0, right: 0, alignItems: 'center' },
  medallion: { position: 'absolute', top: 30, alignItems: 'center' },
  medallionRing: {
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#FFF6D0',
    backgroundColor: P.surface,
    padding: 2,
  },
  plate: {
    position: 'absolute',
    top: 262,
    left: 40,
    right: 40,
    alignItems: 'center',
    backgroundColor: '#B77A12',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: GOLD,
    paddingVertical: 7,
  },
  plateName: { color: '#FFF6D0', fontSize: 18, fontWeight: '900' },
  plateScore: { color: '#FFE9A8', fontSize: 12, fontWeight: '800' },
  panel: {
    position: 'absolute',
    top: 346,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${P.surface}EE`,
    borderColor: P.arcane,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 12,
  },
  ali: { width: 86, height: 86, overflow: 'hidden' },
  youLabel: { color: P.inkMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  rank: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  of: { color: P.inkMuted, fontSize: 13, fontWeight: '700' },
  score: { color: P.ink, fontSize: 15, fontWeight: '800' },
  msg: { color: P.inkMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  runners: { position: 'absolute', top: 480, left: 16, right: 16, gap: 6 },
  runner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${P.surface}CC`,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  runnerRank: { width: 28, fontSize: 14, fontWeight: '900' },
  runnerName: { flex: 1, color: P.ink, fontSize: 14, fontWeight: '700' },
  runnerScore: { color: P.ink, fontSize: 14, fontWeight: '800' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 14 },
});
