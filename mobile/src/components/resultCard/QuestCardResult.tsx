import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { AliCharacter } from '@/components/AliCharacter';
import { ArcadeArt } from '@/features/proto/ui/ProtoArt';
import { Confetti } from './Confetti';
import { CardFooter, P, GOLD, RingAvatar, placeColor, scoreText, timeText } from './shared';
import { CARD_HEIGHT, CARD_WIDTH, meOf, pct, type ResultCardData } from './types';

const INNER_W = CARD_WIDTH - 12;

function ScoreRing({ value, label }: { value: number; label: string }) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 75 ? GOLD : value >= 50 ? P.success : P.danger;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={P.ringTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ color: P.ink, fontSize: 24, fontWeight: '900' }}>{value}%</Text>
      <Text style={{ color: P.inkMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>
        {label}
      </Text>
    </View>
  );
}

/** Option C — "Quest Card": a collectible card with the game's art, a rank medal and an accuracy ring. */
export function QuestCardResult({ data }: { data: ResultCardData }) {
  const me = meOf(data);
  const ranked = data.players.filter((p) => p.rank != null).sort((a, b) => a.rank! - b.rank!);
  const top = ranked.slice(0, 4);
  const medal = placeColor(me?.rank ?? null);

  return (
    <LinearGradient
      colors={[GOLD, '#B77A12', GOLD, '#8B5CF6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.frame}
    >
      <View style={s.card}>
        <View style={s.art}>
          <ArcadeArt kind={data.gameArt} width={INNER_W} height={178} style={{ borderRadius: 0 }} />
          <LinearGradient
            colors={['transparent', P.background]}
            style={[StyleSheet.absoluteFill, { top: 90 }]}
          />
          <View style={s.ribbon}>
            <Text style={s.ribbonText} numberOfLines={1}>
              {data.title}
            </Text>
            <Text style={s.ribbonSub}>{data.gameLabel}</Text>
          </View>
          <View style={s.ali}>
            <AliCharacter
              size={74}
              framing="bust"
              animated={false}
              expression={data.aliExpression}
              pose={data.aliPose}
              intensity={data.aliIntensity}
            />
          </View>
        </View>

        <View style={s.medalWrap}>
          <LinearGradient colors={[medal, '#7A5A12']} style={s.medal}>
            <View style={s.medalInner}>
              <Text style={[s.medalRank, { color: medal }]}>#{me?.rank ?? '–'}</Text>
              <Text style={s.medalOf}>{data.ofPlayers}</Text>
            </View>
          </LinearGradient>
        </View>

        <Text style={s.headline}>{data.headline}</Text>

        <View style={s.stats}>
          <ScoreRing value={pct(me)} label={data.accuracyLabel} />
          <View style={s.pills}>
            <View style={s.pill}>
              <Text style={s.pillValue}>{me ? scoreText(me) : '–'}</Text>
              <Text style={s.pillLabel}>{data.accuracyLabel}</Text>
            </View>
            <View style={s.pill}>
              <Text style={s.pillValue}>{me && timeText(me) ? timeText(me) : '–'}</Text>
              <Text style={s.pillLabel}>{data.timeLabel}</Text>
            </View>
          </View>
        </View>

        <View style={s.rows}>
          {top.map((p) => (
            <View key={p.id} style={[s.row, p.isMe && { borderColor: P.arcane }]}>
              <Text style={[s.rowRank, { color: placeColor(p.rank) }]}>{p.rank}</Text>
              <RingAvatar player={p} size={22} ring={placeColor(p.rank)} />
              <Text style={s.rowName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={s.rowScore}>{scoreText(p)}</Text>
            </View>
          ))}
        </View>

        <View style={s.foot}>
          <CardFooter footer={data.footer} brand={data.brand} />
        </View>
        <Confetti width={INNER_W} height={190} count={18} seed={21} top={20} bottom={120} opacity={0.9} />
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  frame: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 26, padding: 3 },
  card: {
    flex: 1,
    borderRadius: 23,
    backgroundColor: P.background,
    overflow: 'hidden',
    alignItems: 'center',
  },
  art: { width: INNER_W, height: 178 },
  ribbon: { position: 'absolute', left: 14, bottom: 22, right: 100 },
  ribbonText: { color: P.ink, fontSize: 21, fontWeight: '900' },
  ribbonSub: {
    color: P.arcaneSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  ali: { position: 'absolute', right: 8, bottom: -6, width: 74, height: 74, overflow: 'hidden' },
  medalWrap: { marginTop: -34 },
  medal: { width: 96, height: 96, borderRadius: 48, padding: 4 },
  medalInner: {
    flex: 1,
    borderRadius: 44,
    backgroundColor: P.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalRank: { fontSize: 34, fontWeight: '900', lineHeight: 38 },
  medalOf: { color: P.inkMuted, fontSize: 10, fontWeight: '800', marginTop: -2 },
  headline: { color: P.ink, fontSize: 18, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  pills: { gap: 8 },
  pill: {
    backgroundColor: P.surface,
    borderRadius: 12,
    borderColor: P.border,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 18,
    minWidth: 120,
  },
  pillValue: { color: P.ink, fontSize: 18, fontWeight: '900' },
  pillLabel: { color: P.inkMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  rows: { alignSelf: 'stretch', paddingHorizontal: 14, gap: 5, marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  rowRank: { width: 14, fontSize: 14, fontWeight: '900' },
  rowName: { flex: 1, color: P.ink, fontSize: 13, fontWeight: '700' },
  rowScore: { color: P.ink, fontSize: 13, fontWeight: '800' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 10 },
});
