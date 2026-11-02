import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "./ui";
import { colors, radius } from "@/real/theme";
import { DAYS, fillOf, percents, weightAt } from "@/real/utils/dayWeights";

const HEIGHT = 176;

/**
 * 요일별 비중을 볼륨 막대처럼 위아래로 끌어 정한다. 값(min~max)만 받아 표시하고 바뀐 값을 onChange로 알린다.
 * 막대마다 접근성 조절(adjustable)로 1씩 올리고 내릴 수 있다.
 */
export function DayWeightBars({
  weights,
  min,
  max,
  today,
  onChange,
  onDragging,
}: {
  weights: number[];
  min: number;
  max: number;
  /** 0=월 … 6=일 */
  today: number;
  onChange: (index: number, weight: number) => void;
  /** 끄는 동안 바깥 스크롤을 멈추게 알린다 */
  onDragging?: (on: boolean) => void;
}) {
  const shares = percents(weights);
  return (
    <View style={styles.row}>
      {DAYS.map((d, i) => (
        <Bar
          key={d}
          label={d}
          weight={weights[i]}
          share={shares[i]}
          min={min}
          max={max}
          on={i === today}
          onChange={(w) => onChange(i, w)}
          onDragging={onDragging}
        />
      ))}
    </View>
  );
}

function Bar({
  label,
  weight,
  share,
  min,
  max,
  on,
  onChange,
  onDragging,
}: {
  label: string;
  weight: number;
  share: number;
  min: number;
  max: number;
  on: boolean;
  onChange: (weight: number) => void;
  onDragging?: (on: boolean) => void;
}) {
  // Where the finger first touched the track (locationY) and the page (pageY); moves are measured from there.
  const start = useRef({ y: 0, pageY: 0 });
  const at = (pageY: number) =>
    weightAt(start.current.y + pageY - start.current.pageY, HEIGHT, min, max);
  const end = () => onDragging?.(false);
  const ink = on ? colors.brand : colors.textSub;
  return (
    <View style={styles.col}>
      <T size={12} weight="700" color={ink} num>
        {share}%
      </T>
      <View
        style={styles.track}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          start.current = {
            y: e.nativeEvent.locationY,
            pageY: e.nativeEvent.pageY,
          };
          onDragging?.(true);
          onChange(at(e.nativeEvent.pageY));
        }}
        onResponderMove={(e) => onChange(at(e.nativeEvent.pageY))}
        onResponderRelease={end}
        onResponderTerminate={end}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}요일 비중`}
        accessibilityValue={{ min, max, now: weight, text: `${share}%` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const next =
            e.nativeEvent.actionName === "increment" ? weight + 1 : weight - 1;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      >
        {/* Children ignore touches so locationY is always measured on the track itself. */}
        <View pointerEvents="none" style={styles.fillBox}>
          <View
            style={[
              styles.fill,
              {
                height: `${fillOf(weight, min, max) * 100}%`,
                // Always set opacity (only its value changes) so the view never flattens (bug-transaction-edit-blank-screen).
                opacity: on ? 1 : 0.4,
              },
            ]}
          />
        </View>
      </View>
      <T size={13} weight={on ? "800" : "500"} color={ink}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  col: { flex: 1, alignItems: "center", gap: 6 },
  track: {
    alignSelf: "stretch",
    height: HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.sunken,
    overflow: "hidden",
  },
  fillBox: { flex: 1, justifyContent: "flex-end" },
  fill: {
    alignSelf: "stretch",
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
});
