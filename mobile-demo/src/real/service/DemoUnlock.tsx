/**
 * 시연 전용: 레벨 코스튬 미리보기를 덮는 자물쇠. breaking이 되면 옅은 파란빛으로 빛나다가 두 조각으로 깨지고
 * 파편이 흩어지며 덮개가 걷힌다(약 1.1초). 실제 앱에는 없는 시연용 해금 연출이다.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReducedMotion } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";

const SIZE = 44;
const DURATION = 1100;
/** 깨지기 시작하는 시점(0~1). 앞부분은 빛나며 떨리고, 뒤부분은 갈라져 흩어진다 */
const CRACK = 0.42;
const SHARDS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2 ? 0.3 : -0.2);
  const dist = 46 + (i % 3) * 14;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, rot: (i % 2 ? 1 : -1) * (90 + i * 25), size: 5 + (i % 3) * 2 };
});

export function DemoLock({
  breaking,
  onBroken,
}: {
  breaking: boolean;
  onBroken: () => void;
}) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!breaking) {
      t.setValue(0);
      return;
    }
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: reduced ? 200 : DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && onBroken());
    return () => anim.stop();
    // onBroken은 매번 새로 만들어지므로 breaking이 바뀔 때만 시작한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breaking, reduced, t]);

  const before = (out: number[]) => t.interpolate({ inputRange: [0, CRACK * 0.5, CRACK], outputRange: out, extrapolate: "clamp" });
  const after = (from: number, to: number) =>
    t.interpolate({ inputRange: [CRACK, 1], outputRange: [from, to], extrapolate: "clamp", easing: Easing.out(Easing.cubic) });
  // 빛나기: 처음엔 흰 자물쇠, 금이 가기 직전까지 옅은 파랑으로 물들며 떨린다
  const glowOpacity = t.interpolate({ inputRange: [0, CRACK, 0.75, 1], outputRange: [0, 0.9, 0.45, 0], extrapolate: "clamp" });
  const glowScale = t.interpolate({ inputRange: [0, CRACK, 1], outputRange: [0.5, 1.15, 2.1], extrapolate: "clamp" });
  const shake = t.interpolate({
    inputRange: [0, 0.1, 0.16, 0.22, 0.28, 0.34, CRACK],
    outputRange: ["0deg", "0deg", "-7deg", "7deg", "-9deg", "9deg", "0deg"],
    extrapolate: "clamp",
  });
  const lockScale = before([1, 1.12, 1.22]);
  const tint = t.interpolate({ inputRange: [0, CRACK * 0.6], outputRange: [0, 1], extrapolate: "clamp" });
  const shade = t.interpolate({ inputRange: [0, CRACK, 1], outputRange: [1, 1, 0], extrapolate: "clamp" });
  const pieces = after(1, 0);

  const half = (side: -1 | 1) => (
    <Animated.View
      style={[
        styles.half,
        side === 1 && { left: SIZE / 2 },
        {
          opacity: pieces,
          transform: [
            { translateX: after(0, side * 30) },
            { translateY: after(0, 26) },
            { rotate: t.interpolate({ inputRange: [CRACK, 1], outputRange: ["0deg", `${side * 34}deg`], extrapolate: "clamp" }) },
          ],
        },
      ]}
    >
      <View style={{ marginLeft: side === 1 ? -SIZE / 2 : 0 }}>
        <LockIcon tint={tint} />
      </View>
    </Animated.View>
  );

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: shade }]}>
      <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <Animated.View style={[styles.lock, { transform: [{ rotate: shake }, { scale: lockScale }] }]}>
        {breaking ? (
          <>
            {half(-1)}
            {half(1)}
          </>
        ) : (
          <Ionicons name="lock-closed" size={SIZE} color={colors.onBrand} />
        )}
      </Animated.View>
      {breaking &&
        SHARDS.map((s, i) => (
          <Animated.View
            key={i}
            style={[
              styles.shard,
              {
                width: s.size,
                height: s.size,
                opacity: t.interpolate({ inputRange: [0, CRACK, CRACK + 0.05, 1], outputRange: [0, 0, 1, 0], extrapolate: "clamp" }),
                transform: [
                  { translateX: after(0, s.x) },
                  { translateY: after(0, s.y) },
                  { rotate: t.interpolate({ inputRange: [CRACK, 1], outputRange: ["45deg", `${45 + s.rot}deg`], extrapolate: "clamp" }) },
                ],
              },
            ]}
          />
        ))}
    </Animated.View>
  );
}

/** 흰색에서 옅은 파랑(brandSoft)으로 물드는 자물쇠: 흰 자물쇠 위에 옅은 파랑 자물쇠를 겹쳐 서서히 보인다 */
function LockIcon({ tint }: { tint: Animated.AnimatedInterpolation<number> }) {
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Ionicons name="lock-closed" size={SIZE} color={colors.onBrand} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tint }]}>
        <Ionicons name="lock-closed" size={SIZE} color={colors.brandSoft} style={styles.glowText} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.soft,
    backgroundColor: "rgba(16, 24, 40, 0.42)",
  },
  lock: { width: SIZE, height: SIZE },
  half: { position: "absolute", top: 0, left: 0, width: SIZE / 2, height: SIZE, overflow: "hidden" },
  glow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    // 옅은 파랑 빛무리: brandSoft 반투명 면 + 브랜드 블루 번짐
    backgroundColor: `${colors.brandSoft}59`,
    boxShadow: `0 0 40px 18px ${colors.brand}73`,
  } as object,
  glowText: { textShadowColor: colors.brand, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  shard: { position: "absolute", backgroundColor: colors.brandSoft, borderRadius: 1 },
});
