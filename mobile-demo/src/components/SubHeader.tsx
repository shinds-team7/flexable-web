import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { T } from './ui';

/** 히스토리가 없으면(웹 직접 진입) fallback 경로로 이동. 시연/서비스 경로가 다르므로 fallback은 항상 명시한다. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function SubHeader({ title, right, fallback }: { title: string; right?: ReactNode; fallback: Href }) {
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => goBack(fallback)} hitSlop={10} style={styles.side}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <T size={17} weight="700" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
        {title}
      </T>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  side: { width: 64 },
});
