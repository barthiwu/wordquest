import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AliScene } from '@/features/proto/ui/AliScene';
import { CrownArt } from '@/features/proto/ui/ProtoArt';
import { Confetti } from './Confetti';
import { CardFooter, P, GOLD, RingAvatar, placeColor, scoreText, timeText } from './shared';
import { CARD_HEIGHT, CARD_WIDTH, meOf, type ResultCardData, type ResultPlayer } from './types';

const BLOCK_H: Record<number, number> = { 1: 128, 2: 100, 3: 80 };

function PodiumColumn({ player, place }: { player: ResultPlayer; place: 1 | 2 | 3 }) {
  const color = placeColor(place);
  const t = timeText(player);
  return (
    <View style={s.col}>
      {place === 1 ? (
        <View style={{ marginBottom: -6 }}>
          <CrownArt size={40} />
        </View>
      ) : null}
      <RingAvatar player={player} size={place === 1 ? 54 : 44} ring={color} />
      <Text style={[s.name, player.isMe && { color: GOLD }]} numberOfLines={1}>
        {player.name}
      </Text>
      <LinearGradient
        colors={[color, `${color}55`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[s.block, { height: BLOCK_H[place] }]}
      >
        <Text style={s.place}>{place}</Text>
        <Text style={s.blockScore}>{scoreText(player)}</Text>
        {t ? <Text style={s.blockTime}>{t}</Text> : null}
      </LinearGradient>
    </View>
  );
}

/** Option A — "Podium Night": ALI cheers over a night scene above a three-step podium. */
export function PodiumNightCard({ data }: { data: ResultCardData }) {
  const ranked = data.players.filter((p) => p.rank != null).sort((a, b) => a.rank! - b.rank!);
  const [first, second, third] = [ranked[0], ranked[1], ranked[2]];
  const me = meOf(data);
  const order: Array<[ResultPlayer, 1 | 2 | 3]> = [];
  if (second) order.push([second, 2]);
  if (first) order.push([first, 1]);
  if (third) order.push([third, 3]);

  return (
    <View style={s.card}>
      <AliScene
        variant="castle"
        height={292}
        forceMode="dark"
        animated={false}
        aliSize={104}
        fadeTo={P.background}
        expression={data.aliExpression}
        pose={data.aliPose}
        intensity={data.aliIntensity}
        message={data.aliMessage}
        bubbleTop={84}
      />
      <LinearGradient
        colors={['transparent', P.background]}
        style={{ position: 'absolute', left: 0, right: 0, top: 244, height: 52 }}
        pointerEvents="none"
      />
      <Confetti width={CARD_WIDTH} height={300} count={12} seed={11} top={64} bottom={84} />
      <Confetti width={CARD_WIDTH} height={300} count={18} seed={23} top={196} bottom={262} />

      <View style={s.head} pointerEvents="none">
        <Text style={s.eyebrow}>{data.gameLabel}</Text>
        <Text style={s.title} numberOfLines={1}>
          {data.title}
        </Text>
      </View>

      <View style={s.podium}>
        {order.map(([p, place]) => (
          <PodiumColumn key={p.id} player={p} place={place} />
        ))}
      </View>

      {me ? (
        <View style={s.me}>
          <RingAvatar player={me} size={34} ring={placeColor(me.rank)} />
          <View style={{ flex: 1 }}>
            <Text style={s.meLabel}>{data.youLabel}</Text>
            <Text style={s.meRank}>
              #{me.rank ?? '–'} <Text style={s.meOf}>{data.ofPlayers}</Text>
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.meScore}>{scoreText(me)}</Text>
            {timeText(me) ? <Text style={s.meTime}>{timeText(me)}</Text> : null}
          </View>
        </View>
      ) : null}

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
  head: { position: 'absolute', top: 18, left: 20, right: 20, alignItems: 'flex-start' },
  eyebrow: {
    color: P.arcaneSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: { color: P.ink, fontSize: 22, fontWeight: '900' },
  podium: {
    position: 'absolute',
    top: 226,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  col: { width: 98, alignItems: 'center', gap: 4 },
  name: { color: P.ink, fontSize: 12, fontWeight: '800', maxWidth: 96 },
  block: {
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: 'center',
    paddingTop: 6,
    gap: 1,
  },
  place: { color: P.background, fontSize: 30, fontWeight: '900', lineHeight: 34 },
  blockScore: { color: P.background, fontSize: 13, fontWeight: '900' },
  blockTime: { color: P.background, fontSize: 11, fontWeight: '700', opacity: 0.75 },
  me: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 500,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.surface,
    borderColor: P.arcane,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  meLabel: { color: P.inkMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  meRank: { color: P.ink, fontSize: 20, fontWeight: '900' },
  meOf: { color: P.inkMuted, fontSize: 12, fontWeight: '700' },
  meScore: { color: P.ink, fontSize: 20, fontWeight: '900' },
  meTime: { color: P.inkMuted, fontSize: 12, fontWeight: '700' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 14 },
});
