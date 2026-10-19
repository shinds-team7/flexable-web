import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { DOW } from '@/utils/format';
import { T } from '@/components/ui';

/** 휴대폰 잠금화면 + 푸시 알림 (시연용) */
export function LockScreen({
  now,
  title,
  body,
  onOpen,
  children,
}: {
  now: Date;
  title: string;
  body: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <View style={styles.wrap}>
      <View style={{ alignItems: 'center', marginTop: 56 }}>
        <T size={16} weight="600" color="rgba(255,255,255,0.8)">
          {now.getMonth() + 1}월 {now.getDate()}일 {DOW[now.getDay()]}요일
        </T>
        <T size={76} weight="700" color="#fff" style={{ letterSpacing: -2, marginTop: 2 }}>
          {hh}:{mm}
        </T>
      </View>

      <Pressable accessibilityRole="button" style={styles.noti} onPress={onOpen}>
        <View style={styles.head}>
          <Image source={require('../../../assets/brand/logo.png')} style={styles.icon} />
          <T size={13} weight="600" color="rgba(255,255,255,0.75)" style={{ flex: 1 }}>
            텅장관리
          </T>
          <T size={12} color="rgba(255,255,255,0.6)">
            지금
          </T>
        </View>
        <T size={16} weight="700" color="#fff" style={{ marginTop: 6 }}>
          {title}
        </T>
        <T size={14} color="rgba(255,255,255,0.88)" style={{ marginTop: 2, lineHeight: 20 }}>
          {body}
        </T>
      </Pressable>

      <View style={{ flex: 1 }} />
      {children}
      <T size={12} color="rgba(255,255,255,0.55)" style={{ textAlign: 'center', marginBottom: 18 }}>
        알림을 누르면 앱으로 이동해요
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0A1F5C', padding: 16 },
  noti: { marginTop: 36, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 22, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 22, height: 22, borderRadius: 6 },
});
