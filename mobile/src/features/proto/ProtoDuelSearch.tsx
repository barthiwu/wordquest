import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { AvatarBubble } from '@/components/AvatarBubble';
import { WORD_DUEL_TIPS } from '@/features/arcade/wordDuelTips';
import { AliScene } from './ui/AliScene';
import { GlassCard, Panel, ProtoButton } from './ui/ProtoUI';
import { useProtoExtras } from './ui/useProtoExtras';

const TIP_ROTATE_MS = 5500;

export interface ProtoDuelSearchProps {
  title: string;
  subtitle: string;
  wordTipLabel: string;
  cancelLabel: string;
  onCancel: () => void;
}

function Pulse({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        { borderColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }] },
      ]}
    />
  );
}

/**
 * Prototype "New look" Word Duel opponent-finding screen. ALI stands
 * focused over the arena while a radar pulses next to the player's avatar;
 * the rotating Word Tip keeps the wait useful, exactly like the standard
 * matchmaking screen (same tips, same cancel behaviour).
 */
export function ProtoDuelSearch({ title, subtitle, wordTipLabel, cancelLabel, onCancel }: ProtoDuelSearchProps) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const user = useAuthStore((s) => s.user);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * WORD_DUEL_TIPS.length));
  const tipOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(tipOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setTipIndex((i) => (i + 1) % WORD_DUEL_TIPS.length);
        Animated.timing(tipOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, TIP_ROTATE_MS);
    return () => clearInterval(interval);
  }, [tipOpacity]);
  const tip = WORD_DUEL_TIPS[tipIndex];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <AliScene
        variant="arena"
        height={240}
        aliSize={130}
        bubbleTop={36}
        expression="FOCUSED"
        pose="FOCUSED_STANCE"
        message={title}
        fadeTo={colors.background}
      />
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitle}</Text>

        <GlassCard style={styles.versus}>
          <View style={styles.side}>
            <View style={[styles.avatarRing, { borderColor: colors.arcane }]}>
              <AvatarBubble colors={colors} avatarUrl={user?.avatarUrl} username={user?.displayName ?? '?'} size={64} />
            </View>
            <Text style={[styles.sideName, { color: colors.ink }]} numberOfLines={1}>{user?.displayName ?? ''}</Text>
          </View>
          <Text style={[styles.vs, { color: x.cta[0] }]}>VS</Text>
          <View style={styles.side}>
            <View style={styles.radar}>
              <Pulse delay={0} color={colors.arcane} />
              <Pulse delay={900} color={colors.arcane} />
              <View style={[styles.avatarRing, styles.unknown, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="help" size={32} color={colors.inkMuted} />
              </View>
            </View>
            <Text style={[styles.sideName, { color: colors.inkMuted }]}>…</Text>
          </View>
        </GlassCard>

        <Panel style={styles.tip}>
          <Text style={[styles.tipLabel, { color: colors.arcaneSoft }]}>{wordTipLabel}</Text>
          <Animated.View style={{ opacity: tipOpacity, gap: 4 }}>
            <Text style={[styles.tipWord, { color: colors.ink }]}>{tip.word}</Text>
            <Text style={{ color: colors.inkMuted, fontSize: 14 }}>{tip.definition}</Text>
            <Text style={{ color: colors.ink, fontSize: 14, fontStyle: 'italic' }}>{tip.usage}</Text>
          </Animated.View>
        </Panel>

        <ProtoButton variant="outline" label={cancelLabel} onPress={onCancel} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  body: { paddingHorizontal: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center', marginTop: -10 },
  subtitle: { textAlign: 'center', fontSize: 15, fontWeight: '600' },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 18 },
  side: { alignItems: 'center', gap: 8, width: 110 },
  avatarRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  unknown: { borderStyle: 'dashed' },
  sideName: { fontSize: 14, fontWeight: '800', maxWidth: 110 },
  vs: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  radar: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2 },
  tip: { gap: 6 },
  tipLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  tipWord: { fontSize: 22, fontWeight: '900' },
});

/** Prototype "no opponent found" state: ALI sympathetic, retry + back. */
export function ProtoDuelNoOpponent({
  title,
  subtitle,
  retryLabel,
  backLabel,
  onRetry,
  onBack,
}: {
  title: string;
  subtitle: string;
  retryLabel: string;
  backLabel: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const colors = useThemeColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <AliScene
        variant="arena"
        height={240}
        aliSize={130}
        bubbleTop={36}
        expression="CONCERNED"
        pose="CONCERN_DROP"
        message={title}
        fadeTo={colors.background}
      />
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitle}</Text>
        <ProtoButton label={retryLabel} icon="refresh" onPress={onRetry} />
        <ProtoButton variant="outline" label={backLabel} onPress={onBack} />
      </View>
    </ScrollView>
  );
}
