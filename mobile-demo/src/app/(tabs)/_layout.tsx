import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { AppHeader } from '@/demo/components/AppHeader';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { demoRoutes } from '@/demo/routes';

export default function TabsLayout() {
  const { onboarded } = useStore();
  if (!onboarded) return <Redirect href={demoRoutes.onboarding} />;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      {/* 탭 이동은 상단 AppHeader 네비바가 담당 — 기본 탭바는 숨김 */}
      <Tabs
        tabBar={() => null}
        backBehavior="history"
        screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' }, sceneStyle: { backgroundColor: colors.bg } }}
      />
    </View>
  );
}
