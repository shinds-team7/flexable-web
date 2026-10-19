/**
 * 시연 앱 루트 레이아웃(웹 전용) — 폰 모양 틀·토스트·Mock 상태(AppStore)를 주입한다.
 * 모든 시연 화면 상단에 '시연용 · 예시 데이터' 띠를 둔다(헤더 없는 온보딩·잠금화면 포함).
 * 사이트의 /m 아래에 배포된다(app.json experiments.baseUrl).
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ToastProvider } from "@/components/Toast";
import { T } from "@/components/ui";
import { AppStoreProvider } from "@/demo/store/AppStore";
import { DEMO_VERSION } from "@/demo/version";
import { colors } from "@/theme";

export default function DemoLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.outer}>
        <SafeAreaView style={styles.phone} edges={["top", "bottom"]}>
          <StatusBar style="dark" />
          <ToastProvider>
            <AppStoreProvider>
              <View
                style={styles.banner}
                accessibilityRole="text"
                accessibilityLabel={`시연용 화면, 예시 데이터, 버전 ${DEMO_VERSION}`}
              >
                <T size={12} weight="700" color={colors.brandDark} num>
                  시연용 · 예시 데이터 · v{DEMO_VERSION}
                </T>
              </View>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              />
            </AppStoreProvider>
          </ToastProvider>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#DCE1EA", alignItems: "center" },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#fff",
    overflow: "hidden",
    boxShadow: "0 0 24px rgba(16,24,40,0.08)",
  } as object,
  banner: {
    backgroundColor: colors.brandSoft,
    paddingVertical: 4,
    alignItems: "center",
  },
});
