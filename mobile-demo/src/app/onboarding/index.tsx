/** 온보딩 0 — 스플래시/시작 화면 (블루 배경 + 흰 로고 마크) */
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { demoRoutes } from '@/demo/routes';

export default function Welcome() {
  const { completeOnboarding } = useStore();
  return (
    <View style={styles.wrap}>
      <View style={styles.center}>
        <Image source={require('../../../assets/brand/mark-white.png')} style={styles.logo} resizeMode="contain" />
        <T size={30} weight="800" color="#fff" style={{ marginTop: 22 }}>
          텅장관리
        </T>
        <T size={14} weight="700" color="rgba(255,255,255,0.8)" style={{ marginTop: 2, letterSpacing: 1 }}>
          flex-able
        </T>
        <T size={18} weight="600" color="#fff" style={{ marginTop: 34, textAlign: 'center', lineHeight: 27 }}>
          월세, 카드값, 주말 약속까지 다 빼고{'\n'}
          <T size={18} weight="800" color="#fff">
            그래서 오늘 얼마 써도 돼?
          </T>
        </T>
      </View>

      <View style={styles.bottom}>
        <Pressable accessibilityRole="button" style={styles.start} onPress={() => router.push(demoRoutes.onboardingAccount)}>
          <T size={16} weight="800" color={colors.brandDark}>
            시작하기
          </T>
        </Pressable>
        <Pressable accessibilityRole="button"
          style={{ padding: 14, alignItems: 'center' }}
          onPress={() => {
            completeOnboarding();
            router.replace(demoRoutes.home);
          }}
        >
          <T size={14} weight="600" color="rgba(255,255,255,0.9)">
            체험 데이터로 둘러보기
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.brand, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 112, height: 96 },
  bottom: { padding: 20, paddingBottom: 28 },
  start: { height: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
