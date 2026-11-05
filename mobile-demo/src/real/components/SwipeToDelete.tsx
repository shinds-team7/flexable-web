import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
} from "react-native";
import { colors } from "@/real/theme";
import { useAnimValue } from "./ui";

/** 조금 밀면 멈춰서 휴지통이 보이는 폭 */
const REVEAL = 76;
/** 이 비율보다 더 밀고 놓으면 바로 지운다 */
const COMMIT = 0.55;

/**
 * 왼쪽으로 밀 수 있는 한 줄. 밀면 줄이 왼쪽으로 밀리며 오른쪽에 빨간 휴지통이 나오고,
 * 휴지통을 누르거나 끝까지 쭉 밀면 onDelete를 부른다. 지우는 움직임이 끝난 뒤에 부른다.
 * 줄 배경은 불투명해야 뒤의 빨간 면이 가려진다(content의 배경은 background로 준다).
 */
export function SwipeToDelete({
  children,
  background,
  onDelete,
  deleteLabel,
}: {
  children: ReactNode;
  background: string;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const x = useAnimValue(0);
  const height = useAnimValue(1);
  const [open, setOpen] = useState(false);
  // 지우는 동안에만 높이를 고정해 접는다(평소에는 내용 높이를 따른다)
  const [collapsing, setCollapsing] = useState<number>();
  // 제스처 중에만 읽고 쓰는 값. 렌더링에는 쓰지 않는다
  const gesture = useRef({
    width: 0,
    rowHeight: 0,
    start: 0,
    current: 0,
    gone: false,
    onDelete,
  });
  useEffect(() => {
    gesture.current.onDelete = onDelete;
  }, [onDelete]);
  useEffect(() => {
    const id = x.addListener(({ value }) => {
      gesture.current.current = value;
    });
    return () => x.removeListener(id);
  }, [x]);

  // 아래 콜백은 제스처 중에만 불리고 렌더링 중에는 ref를 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [handlers] = useState(() => {
    const settle = (to: number, done?: () => void) =>
      Animated.timing(x, {
        toValue: to,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(done);
    const close = () => {
      setOpen(false);
      settle(0);
    };
    const remove = () => {
      if (gesture.current.gone) return;
      gesture.current.gone = true;
      setCollapsing(gesture.current.rowHeight);
      // 끝까지 밀어 낸 뒤 줄 높이를 접고 지운다
      settle(-gesture.current.width, () =>
        Animated.timing(height, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => gesture.current.onDelete()),
      );
    };
    const pan = PanResponder.create({
      // 가로로 확실히 움직일 때만 가져가서 세로 스크롤과 줄 누르기는 그대로 둔다
      onMoveShouldSetPanResponder: (_, s) =>
        Math.abs(s.dx) > 8 && Math.abs(s.dx) > Math.abs(s.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        x.stopAnimation();
        gesture.current.start = gesture.current.current;
      },
      onPanResponderMove: (_, s) => {
        x.setValue(
          Math.max(
            -gesture.current.width,
            Math.min(0, gesture.current.start + s.dx),
          ),
        );
      },
      onPanResponderRelease: (_, s) => {
        if (
          gesture.current.width > 0 &&
          (gesture.current.current < -gesture.current.width * COMMIT ||
            s.vx < -1.2)
        ) {
          remove();
        } else if (gesture.current.current < -REVEAL / 2) {
          setOpen(true);
          settle(-REVEAL);
        } else close();
      },
      onPanResponderTerminate: close,
    });
    return { pan: pan.panHandlers, remove, close };
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        collapsing !== undefined && {
          height: height.interpolate({
            inputRange: [0, 1],
            outputRange: [0, collapsing],
          }),
        },
      ]}
      onLayout={(e) => {
        gesture.current.width = e.nativeEvent.layout.width;
        gesture.current.rowHeight = e.nativeEvent.layout.height;
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        onPress={handlers.remove}
        style={styles.trash}
      >
        <Ionicons name="trash" size={22} color="#fff" />
      </Pressable>
      <Animated.View
        style={{ backgroundColor: background, transform: [{ translateX: x }] }}
        {...handlers.pan}
      >
        {children}
        {open && (
          // 휴지통이 보이는 동안에는 줄을 눌러도 열리지 않고 먼저 닫힌다
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="밀어 둔 알림 닫기"
            style={StyleSheet.absoluteFill}
            onPress={handlers.close}
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: colors.danger },
  trash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
});
