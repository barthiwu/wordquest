import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/state/themeStore';
import { useProtoExtras } from './useProtoExtras';

type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Buttons

export function ProtoButton({
  label,
  onPress,
  icon,
  trailingIcon,
  variant = 'primary',
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  trailingIcon?: IconName;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const primary = variant === 'primary';
  const fg = primary ? x.ctaText : variant === 'danger' ? colors.danger : colors.arcaneSoft;
  const content = (
    <View style={styles.btnInner}>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
      {trailingIcon ? <Ionicons name={trailingIcon} size={18} color={fg} /> : null}
    </View>
  );
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        primary && { shadowColor: x.cta[0], shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
        !primary && { borderWidth: 1.5, borderColor: variant === 'danger' ? colors.danger : colors.arcane, backgroundColor: 'transparent' },
        disabled && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {primary ? (
        <LinearGradient colors={x.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Surfaces

export function GlassCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useProtoExtras();
  return <View style={[styles.glass, { backgroundColor: x.glass, borderColor: x.glassBorder }, style]}>{children}</View>;
}

/** Solid navy panel (non-translucent) for content blocks. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

/** The warm parchment scroll used for quest intros, completion and boss headers. */
export function Parchment({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useProtoExtras();
  return (
    <LinearGradient colors={x.parchment} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.parchment, style]}>
      <View style={styles.parchmentEdge} pointerEvents="none" />
      {children}
    </LinearGradient>
  );
}

export function SectionHeader({ title, caption, right }: { title: string; caption?: string; right?: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {right ? right : caption ? <Text style={[styles.sectionCaption, { color: colors.inkMuted }]}>{caption}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small widgets

export function Wordmark({ size = 16 }: { size?: number }) {
  const colors = useThemeColors();
  return (
    <Text accessibilityRole="header" style={{ fontSize: size, fontWeight: '900', letterSpacing: 1.5, color: colors.ink }}>
      WORD<Text style={{ color: colors.arcane }}>QUEST</Text>
    </Text>
  );
}

export function IconBadge({ name, color, size = 40, tint }: { name: IconName; color: string; size?: number; tint?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint ?? `${color}26`,
        borderWidth: 1,
        borderColor: `${color}55`,
      }}
    >
      <Ionicons name={name} size={size * 0.52} color={color} />
    </View>
  );
}

export function Pill({ children, color, style, textStyle }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const colors = useThemeColors();
  const c = color ?? colors.arcaneSoft;
  return (
    <View style={[styles.pill, { backgroundColor: `${c}22`, borderColor: `${c}66` }, style]}>
      <Text style={[styles.pillText, { color: c }, textStyle]}>{children}</Text>
    </View>
  );
}

/** Segmented progress stepper: Guess → Sentence → Paragraph. */
export function StageStepper({ labels, current }: { labels: string[]; current: number }) {
  const colors = useThemeColors();
  return (
    <View style={styles.stepper}>
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const tint = done ? colors.success : active ? colors.arcane : colors.border;
        return (
          <View key={label} style={styles.stepCell}>
            <View style={styles.stepRow}>
              <View style={[styles.stepLine, { backgroundColor: i === 0 ? 'transparent' : i <= current ? colors.arcane : colors.border }]} />
              <View
                style={[
                  styles.stepDot,
                  { borderColor: tint, backgroundColor: done ? colors.success : active ? `${colors.arcane}33` : colors.surface },
                  active && { shadowColor: colors.arcane, shadowOpacity: 0.8, shadowRadius: 8 },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={16} color="#04122B" />
                ) : (
                  <Text style={{ color: active ? colors.ink : colors.inkMuted, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                )}
              </View>
              <View style={[styles.stepLine, { backgroundColor: i === labels.length - 1 ? 'transparent' : i < current ? colors.arcane : colors.border }]} />
            </View>
            <Text style={[styles.stepLabel, { color: active ? colors.ink : colors.inkMuted }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 8, style }: { value: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: colors.ringTrack, overflow: 'hidden' }, style]}>
      {color ? (
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
      ) : (
        <LinearGradient colors={x.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height / 2 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 16, overflow: 'visible', minHeight: 52 },
  btnGradient: { borderRadius: 16, minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 },
  btnText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  glass: { borderRadius: 18, borderWidth: 1, padding: 14 },
  panel: { borderRadius: 18, borderWidth: 1, padding: 14 },
  parchment: { borderRadius: 20, padding: 18, overflow: 'hidden' },
  parchmentEdge: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(120,80,20,0.35)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionCaption: { fontSize: 12, fontWeight: '600' },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '800' },
  stepper: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  stepCell: { flex: 1, alignItems: 'center', gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 2 },
  stepDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 12, fontWeight: '700' },
});
