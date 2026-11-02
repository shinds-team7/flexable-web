import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { T } from "./ui";

/** label: 조각 위에 작게 쓰는 글자(예: '65%'). 좁은 조각은 비워 둔다 */
type Seg = {
  value: number;
  color: string;
  label?: string;
  accessibilityLabel?: string;
};

/** 도넛 차트. segments 합이 total보다 작으면 나머지는 trackColor로 표시(남은 예산). */
export function Donut({
  segments,
  total,
  size = 220,
  stroke = 26,
  trackColor = "#EEF0F3",
  children,
  onSelect,
  selectedIndex,
}: {
  segments: Seg[];
  total: number;
  size?: number;
  stroke?: number;
  trackColor?: string;
  children?: ReactNode;
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((a, s) => a + s.value, 0);
  const denom = Math.max(total, sum, 1);
  const gap = segments.length > 1 ? 2 : 0;

  // 각 조각의 시작 위치(누적 길이)를 미리 계산한다
  const arcs = segments.map((s, i) => {
    const len = (s.value / denom) * c;
    const start = segments
      .slice(0, i)
      .reduce((a, x) => a + (x.value / denom) * c, 0);
    return {
      color: s.color,
      dash: Math.max(0, len - gap),
      start,
      len,
      label: s.label,
    };
  });
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {arcs.map((a, i) => (
          <Path
            key={i}
            d={arcPath(
              size / 2,
              r,
              (a.start / c) * 2 * Math.PI,
              (a.dash / c) * 2 * Math.PI,
            )}
            stroke={a.color}
            strokeWidth={selectedIndex === i ? stroke + 4 : stroke}
            fill="none"
            onPress={onSelect && (() => onSelect(i))}
            accessibilityLabel={segments[i].accessibilityLabel}
          />
        ))}
      </Svg>
      {arcs.map((a, i) => {
        if (!a.label) return null;
        // 조각 가운데 각도(12시 방향에서 시계 방향)로 링 위에 글자를 놓는다
        const angle = ((a.start + a.len / 2) / c) * 2 * Math.PI - Math.PI / 2;
        return (
          <T
            key={`l${i}`}
            pointerEvents="none"
            size={11}
            weight="700"
            color="#fff"
            style={{
              position: "absolute",
              left: size / 2 + r * Math.cos(angle) - 20,
              top: size / 2 + r * Math.sin(angle) - 8,
              width: 40,
              textAlign: "center",
              lineHeight: 16,
            }}
          >
            {a.label}
          </T>
        );
      })}
      {children}
    </View>
  );
}

function arcPath(
  center: number,
  radius: number,
  start: number,
  length: number,
) {
  const point = (angle: number) =>
    `${center + radius * Math.sin(angle)} ${center - radius * Math.cos(angle)}`;
  if (length <= 0) return "";
  if (length >= 2 * Math.PI - 0.00001)
    return `M ${point(start)} A ${radius} ${radius} 0 0 1 ${point(start + Math.PI)} A ${radius} ${radius} 0 0 1 ${point(start + 2 * Math.PI)}`;
  return `M ${point(start)} A ${radius} ${radius} 0 ${length > Math.PI ? 1 : 0} 1 ${point(start + length)}`;
}
