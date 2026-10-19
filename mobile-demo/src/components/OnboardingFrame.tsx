import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { goBack } from './SubHeader';
import { Button, T } from './ui';

/** 온보딩 공통 레이아웃: 진행 바 + 제목 + 본문 + 하단 버튼 */
export function OnboardingFrame({
  step,
  total = 5,
  title,
  subtitle,
  children,
  cta,
  onNext,
  disabled,
  editMode,
  backFallback,
  back = true,
  onCancel,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  cta?: string;
  onNext: () => void;
  disabled?: boolean;
  /** 마이페이지에서 수정 목적으로 들어온 경우: 진행 바 숨기고 '저장' 버튼 */
  editMode?: boolean;
  /** 뒤로 갈 기록이 없을 때(웹 직접 진입) 이동할 경로 */
  backFallback: Href;
  /** 하단 '이전' 버튼. 첫 단계는 위쪽 화살표로, 저장을 마친 단계는 false로 숨긴다 */
  back?: boolean;
  /** 이미 설정을 마친 사용자가 수정하다 그만둘 때: 오른쪽 위 '취소' */
  onCancel?: () => void;
}) {
  const bottomBack = back && step > 1;
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.top}>
        {back && !bottomBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => goBack(backFallback)} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        )}
        {editMode ? (
          <View style={{ flex: 1 }} />
        ) : (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
            </View>
            <T size={12} weight="600" color={colors.textMuted}>
              {step}/{total}
            </T>
          </>
        )}
        {onCancel && (
          <Pressable accessibilityRole="button" accessibilityLabel="설정 취소" onPress={onCancel} hitSlop={10}>
            <T size={15} weight="600" color={colors.textSub}>
              취소
            </T>
          </Pressable>
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <T size={24} weight="800" style={{ lineHeight: 33 }}>
          {title}
        </T>
        {subtitle && (
          <T size={14} color={colors.textMuted} style={{ marginTop: 8, lineHeight: 21 }}>
            {subtitle}
          </T>
        )}
        <View style={{ marginTop: 26, gap: 12 }}>{children}</View>
      </ScrollView>
      <View style={[styles.bottom, { flexDirection: 'row', gap: 10 }]}>
        {bottomBack && <Button label="이전" variant="soft" onPress={() => goBack(backFallback)} disabled={disabled} style={{ flex: 1 }} />}
        <Button label={editMode ? '저장' : (cta ?? '다음')} onPress={onNext} disabled={disabled} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.brand, borderRadius: 2 },
  body: { padding: 22, paddingBottom: 40 },
  bottom: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#fff' },
});
