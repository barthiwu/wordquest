import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { AliCharacter } from '@/components/AliCharacter';
import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
import { MAGPIE_ASPECT } from '@/components/aliMagpieShapes';
import { SceneBackdrop, type SceneVariant } from './SceneBackdrop';
import { useProtoExtras } from './useProtoExtras';
import { useUid } from './useUid';

/** White speech bubble with a tail pointing toward ALI (bottom-left). */
export function ProtoBubble({
  children,
  tail = 'left',
  style,
  animateIn = true,
}: {
  children: ReactNode;
  tail?: 'left' | 'bottom' | 'none';
  style?: StyleProp<ViewStyle>;
  animateIn?: boolean;
}) {
  const x = useProtoExtras();
  const pop = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  useEffect(() => {
    if (!animateIn) return;
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: false }).start();
  }, [animateIn, pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={[styles.bubbleWrap, { opacity: pop, transform: [{ scale }] }, style]}>
      <View style={[styles.bubble, { backgroundColor: x.bubble }]}>
        {typeof children === 'string' ? (
          <Text style={[styles.bubbleText, { color: x.bubbleInk }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
      {tail === 'left' && (
        <Svg width={16} height={14} viewBox="0 0 16 14" style={styles.tailLeft}>
          <Path d="M16,0 L0,13 L14,9 Z" fill={x.bubble} />
        </Svg>
      )}
      {tail === 'bottom' && (
        <Svg width={18} height={12} viewBox="0 0 18 12" style={styles.tailBottom}>
          <Path d="M0,0 L18,0 L5,12 Z" fill={x.bubble} />
        </Svg>
      )}
    </Animated.View>
  );
}

export interface AliSceneProps {
  variant?: SceneVariant;
  height?: number;
  message?: ReactNode;
  expression?: AliExpression;
  pose?: AliPose;
  intensity?: AliIntensity;
  /** ALI's rendered width. */
  aliSize?: number;
  /** Distance of the bubble from the top of the scene (default 10% of height). */
  bubbleTop?: number;
  /** 'left' (default) perches ALI at the left with the bubble to his right; 'center' stands him mid-scene (celebrations). */
  placement?: 'left' | 'center';
  fadeTo?: string;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * The prototype's signature hero: an illustrated scene with ALI perched on
 * a rock and a speech bubble, so every screen that "speaks" through ALI
 * reads as ALI talking in a place — and ALI is fully animated (the same
 * AliCharacter rig: breathing, blinking, tail sway, wing flutter, rune
 * pulse, plus the pose/expression reactions).
 */
/** The scholar magpie is a wider drawing than the old mark (long tail, wings, rune), so scene sizes are tuned up by this factor. */
const ALI_ART_SCALE = 1.25;

export function AliScene({
  variant = 'forest',
  height = 250,
  message,
  expression = 'NEUTRAL',
  pose = 'PERCHED',
  intensity = 0,
  aliSize,
  placement = 'left',
  bubbleTop,
  fadeTo,
  animated = true,
  style,
  children,
}: AliSceneProps) {
  const x = useProtoExtras();
  const uid = useUid();
  const size = Math.round((aliSize ?? height * 0.64) * ALI_ART_SCALE);
  const aliH = size * MAGPIE_ASPECT;
  const center = placement === 'center';
  return (
    <SceneBackdrop
      variant={variant}
      height={height}
      perch={!center}
      fadeTo={fadeTo}
      animated={animated}
      style={style}
    >
      <View
        pointerEvents="none"
        style={[
          styles.ali,
          center ? { left: 0, right: 0, alignItems: 'center', bottom: 6 } : { left: 6, bottom: 14 },
          { height: aliH },
        ]}
      >
        <View style={{ width: size, height: aliH }}>
          {/* Soft halo so ALI's deep-navy plumage always reads against dark scenes. */}
          <Svg
            width={size * 1.9}
            height={size * 1.9}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', left: -size * 0.45, top: aliH / 2 - size * 0.95 }}
          >
            <Defs>
              <RadialGradient id={`aliHalo-${uid}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={x.cta[0]} stopOpacity={0.38} />
                <Stop offset="1" stopColor={x.cta[0]} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={50} cy={50} r={50} fill={`url(#aliHalo-${uid})`} />
          </Svg>
          <AliCharacter
            size={size}
            expression={expression}
            pose={pose}
            intensity={intensity}
            animated={animated}
          />
        </View>
      </View>
      {message ? (
        <View
          style={[
            styles.bubbleSlot,
            center
              ? { left: 24, right: 24, top: 12, alignItems: 'center' }
              : {
                  left: size * (size < 100 ? 1.02 : 0.78),
                  right: 12,
                  top: bubbleTop ?? Math.max(10, height * 0.1),
                  alignItems: 'flex-start',
                },
          ]}
        >
          <ProtoBubble tail={center ? 'bottom' : 'left'}>{message}</ProtoBubble>
        </View>
      ) : null}
      {children}
    </SceneBackdrop>
  );
}

const styles = StyleSheet.create({
  ali: { position: 'absolute' },
  bubbleSlot: { position: 'absolute' },
  bubbleWrap: { maxWidth: '100%' },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleText: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  tailLeft: { position: 'absolute', left: -12, bottom: 8 },
  tailBottom: { position: 'absolute', left: 28, bottom: -10 },
});
