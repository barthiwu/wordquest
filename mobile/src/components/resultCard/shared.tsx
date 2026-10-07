import { StyleSheet, Text, View } from 'react-native';
import { darkColors } from '@/constants/theme';
import { AvatarBubble } from '@/components/AvatarBubble';
import { formatClock } from '@/features/arcade/group/groupFormat';
import type { ResultPlayer } from './types';

/** Share cards are always drawn in the night palette, whatever the app theme. */
export const P = darkColors;
export const GOLD = '#F4C542';
export const SILVER = '#C9D2E4';
export const BRONZE = '#D58B52';

export function placeColor(rank: number | null): string {
  return rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : P.arcaneSoft;
}

export function scoreText(p: ResultPlayer): string {
  return p.correct == null ? '–' : p.total ? `${p.correct}/${p.total}` : String(p.correct);
}

export function timeText(p: ResultPlayer): string {
  return p.timeMs ? formatClock(p.timeMs) : '';
}

/** Avatar with a coloured ring, used on every card. */
export function RingAvatar({
  player,
  size,
  ring,
}: {
  player: ResultPlayer;
  size: number;
  ring: string;
}) {
  return (
    <View
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: (size + 8) / 2,
        borderWidth: 3,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: P.surface,
      }}
    >
      <AvatarBubble colors={P} avatarUrl={player.avatarUrl} username={player.name} size={size} />
    </View>
  );
}

/** Small brand footer every card ends with. */
export function CardFooter({ footer, brand }: { footer: string; brand: string }) {
  return (
    <View style={f.wrap}>
      <Text style={f.footer}>{footer}</Text>
      <Text style={f.brand}>{brand}</Text>
    </View>
  );
}

const f = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  footer: { color: P.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  brand: {
    color: P.arcaneSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
