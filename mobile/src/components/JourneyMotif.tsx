import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JourneyMotifIcon } from '@/constants/journeyVisuals';

interface Props {
  icons: JourneyMotifIcon[];
  color: string;
}

/**
 * Renders a stage's decorative icon scatter (see journeyVisuals.ts) as a
 * non-interactive overlay stretched to fill its parent. Purely visual —
 * `pointerEvents="none"` so it never intercepts taps meant for the card
 * underneath it, and every icon is tinted the stage's own accent color
 * at low opacity rather than a separate palette, so the motif always
 * reads as "this place," not as generic decoration.
 */
export function JourneyMotif({ icons, color }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {icons.map((item, index) => (
        <Ionicons
          key={`${item.icon}-${index}`}
          name={item.icon}
          size={item.size}
          color={color}
          style={{
            position: 'absolute',
            top: `${item.top}%`,
            left: `${item.left}%`,
            opacity: item.opacity,
            transform: item.rotate ? [{ rotate: item.rotate }] : undefined,
          }}
        />
      ))}
    </View>
  );
}
