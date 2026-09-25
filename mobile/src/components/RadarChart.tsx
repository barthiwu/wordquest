import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';

export interface RadarChartDatum {
  key: string;
  label: string;
  /** 0-100. Ignored (treated as 0) when `measured` is false. */
  score: number;
  measured: boolean;
}

interface Props {
  data: RadarChartDatum[];
  size?: number;
}

const GRID_RINGS = [0.25, 0.5, 0.75, 1];

/**
 * A true polygon radar chart, built on react-native-svg rather than a
 * fabricated bar substitute (see SkillRadarScreen's prior doc comment —
 * this replaces it now that the dependency exists). An unmeasured
 * dimension plots at the center (0), never a guessed value — the label
 * ring below the chart is what tells the player "not yet measured"
 * rather than the shape lying about a real score.
 */
export function RadarChart({ data, size = 260 }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const n = data.length;
  if (n < 3) return null;

  const center = size / 2;
  const maxRadius = center - 40; // leave room for axis labels

  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i: number, fraction: number) => {
    const angle = angleFor(i);
    return {
      x: center + Math.cos(angle) * maxRadius * fraction,
      y: center + Math.sin(angle) * maxRadius * fraction,
    };
  };

  const dataPoints = data.map((d, i) => pointAt(i, d.measured ? Math.max(d.score, 0) / 100 : 0));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.wrapper}>
      <Svg width={size} height={size}>
        {GRID_RINGS.map((ring) => (
          <Polygon
            key={ring}
            points={data
              .map((_, i) => {
                const p = pointAt(i, ring);
                return `${p.x},${p.y}`;
              })
              .join(' ')}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {data.map((_, i) => {
          const outer = pointAt(i, 1);
          return (
            <Line
              key={i}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}

        <Polygon
          points={dataPolygon}
          fill={colors.arcane}
          fillOpacity={0.35}
          stroke={colors.arcaneSoft}
          strokeWidth={2}
        />

        {dataPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={colors.arcaneSoft} />
        ))}

        {data.map((d, i) => {
          const labelPoint = pointAt(i, 1.22);
          const angle = angleFor(i);
          const anchor =
            Math.cos(angle) > 0.3 ? 'start' : Math.cos(angle) < -0.3 ? 'end' : 'middle';
          return (
            <SvgText
              key={d.key}
              x={labelPoint.x}
              y={labelPoint.y}
              fill={d.measured ? colors.ink : colors.inkMuted}
              fontSize={typography.scale.xs}
              fontWeight="700"
              textAnchor={anchor}
              alignmentBaseline="middle"
            >
              {d.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: { alignItems: 'center', justifyContent: 'center' },
  });
}
