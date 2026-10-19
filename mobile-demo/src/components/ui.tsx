import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { colors, floating, font, motion, pressed as pressedFx, pressTransition, radius } from '@/theme';

type TProps = TextProps & {
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  color?: string;
  /** 금액·숫자: 자릿수 정렬(tabular-nums) */
  num?: boolean;
};

export function T({ size = 15, weight = '400', color = colors.text, num, style, ...rest }: TProps) {
  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: size,
          fontWeight: weight,
          color,
          fontFamily: font,
          // 큰 글씨일수록 자간을 조금 더 좁힌다
          letterSpacing: size >= 28 ? -0.8 : size >= 20 ? -0.4 : -0.2,
        },
        num && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}

/** 접근성: OS의 '동작 줄이기' 설정 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setReduced(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduced(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** 컴포넌트 수명 동안 유지되는 Animated.Value.
 *  RN의 useAnimatedValue는 react-native-web(0.21)에 없어 웹에서 쓸 수 없으므로 useState 지연 초기화로 만든다. */
export function useAnimValue(initial: number) {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

/** 숫자가 바뀔 때만(첫 렌더 제외) 짧게 굴러가는 금액 — 결제 반영 순간을 보여준다 */
export function useRollingNumber(value: number) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value || reduced) {
      setShown(value);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / motion.number);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return shown;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressTransition, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <T size={17} weight="700" accessibilityRole="header">
        {title}
      </T>
      {right}
    </View>
  );
}

type BtnProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'soft' | 'ghost';
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', icon, style, disabled, ...rest }: BtnProps) {
  const bg = variant === 'primary' ? colors.brand : variant === 'soft' ? colors.brandSoft : 'transparent';
  const fg = variant === 'primary' ? '#fff' : colors.brandDark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      disabled={disabled}
      aria-disabled={!!disabled}
      style={({ pressed }) => [
        styles.btn,
        pressTransition,
        { backgroundColor: disabled ? colors.sunken : bg },
        pressed && (variant === 'primary' ? styles.btnPrimaryPressed : styles.pressed),
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={disabled ? colors.textFaint : fg} />}
      <T size={16} weight="700" color={disabled ? colors.textMuted : fg} style={{ textAlign: 'center' }}>
        {label}
      </T>
    </Pressable>
  );
}

/** 점선 테두리 + 버튼 (일정/계획 추가용) */
export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.add, pressTransition, pressed && styles.pressed]}
    >
      <Ionicons name="add" size={20} color={colors.brandDark} />
      <T size={14} weight="600" color={colors.brandDark}>
        {label}
      </T>
    </Pressable>
  );
}

export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <T size={12} weight="700" color={color}>
        {label}
      </T>
    </View>
  );
}

export function IconCircle({
  name,
  color,
  size = 40,
  bg,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  color: string;
  size?: number;
  bg?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? color + '1F',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function Segment<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View style={styles.segment}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => onChange(it.key)}
            style={[styles.segItem, pressTransition, on && styles.segOn]}
          >
            <T size={14} weight={on ? '700' : '500'} color={on ? colors.text : colors.textMuted}>
              {it.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 하단 시트 모달 — 바닥에서 ease-out으로 올라오고, 닫힐 땐 더 빠르게 내려간다 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  // 열릴 때는 렌더 중에 바로 마운트하고, 닫힐 때는 애니메이션이 끝난 뒤 언마운트한다
  if (visible && !mounted) setMounted(true);
  const p = useAnimValue(0);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      p.setValue(0);
      Animated.timing(p, {
        toValue: 1,
        duration: reduced ? 0 : motion.enter,
        easing: motion.easeOut,
        useNativeDriver: native,
      }).start();
    } else if (mounted) {
      Animated.timing(p, {
        toValue: 0,
        duration: reduced ? 0 : motion.exit,
        easing: motion.easeOut,
        useNativeDriver: native,
      }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dimBg, { opacity: p }]} />
      <View style={styles.dim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" accessibilityRole="button" />
        <Animated.View style={[styles.sheet, floating, { transform: [{ translateY }] }]}>
          {/* 가로 화면처럼 낮은 창에서는 본문이 줄어들어, 안쪽 ScrollView가 스크롤된다 */}
          <View style={{ flexShrink: 1 }}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <T size={19} weight="700" style={{ flex: 1 }} accessibilityRole="header">
                {title}
              </T>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
                <Ionicons name="close" size={22} color={colors.textSub} />
              </Pressable>
            </View>
            {subtitle && (
              <T size={13} color={colors.textMuted} style={{ marginTop: 4, lineHeight: 19 }}>
                {subtitle}
              </T>
            )}
            <View style={{ marginTop: 18, flexShrink: 1 }}>{children}</View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** 가운데 확인 모달 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.dim, styles.dimBg, { justifyContent: 'center', padding: 28 }]}>
        <View style={[styles.dialog, floating]} accessibilityViewIsModal>
          <T size={18} weight="700" accessibilityRole="header">
            {title}
          </T>
          <View style={{ marginTop: 10 }}>
            {typeof message === 'string' ? (
              <T size={14} color={colors.textSub} style={{ lineHeight: 21 }}>
                {message}
              </T>
            ) : (
              message
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
            <Button label={cancelLabel} variant="soft" style={{ flex: 1, height: 48 }} onPress={onCancel} />
            <Button label={confirmLabel} style={{ flex: 1, height: 48 }} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, pressTransition, on && styles.chipOn, pressed && pressedFx]}
    >
      <T size={13} weight="600" color={on ? colors.onBrand : colors.textSub} style={{ textAlign: 'center' }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  dim: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  dimBg: { backgroundColor: 'rgba(16,26,51,0.45)' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: -8, marginBottom: 14 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 22,
    paddingBottom: 34,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: radius.xl - 4, padding: 22, alignSelf: 'center' },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.sunken },
  chipOn: { backgroundColor: colors.brand },
  screen: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  cardPressed: { transform: [{ scale: 0.985 }], backgroundColor: colors.brandSofter },
  btnPrimaryPressed: { transform: [{ scale: 0.97 }], backgroundColor: colors.brandDark },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  btn: {
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  add: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSofter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  segment: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.sm, padding: 4 },
  segItem: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs },
  segOn: { backgroundColor: '#fff', ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(16,26,51,0.10)' } as object) : {}) },
});
