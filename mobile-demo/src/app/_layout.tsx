/**
 * 시연 앱 루트 레이아웃(웹 전용) — 폰 모양 틀·토스트·Mock 상태(AppStore)를 주입한다.
 * 시연 온보딩 뒤 화면은 실제 앱 코드(src/real)라서 실제 앱의 토스트·세션·예산 설정 임시 저장도 함께 둔다.
 * 사이트의 /m 아래에 배포된다(app.json experiments.baseUrl).
 */
import { Stack } from "expo-router";
import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { PhoneHostProvider } from "@/components/PhoneModal";
import { ToastProvider } from "@/components/Toast";
import { AppStoreProvider } from "@/demo/store/AppStore";
import { ToastProvider as RealToastProvider } from "@/real/components/Toast";
import { BudgetDraftProvider } from "@/real/service/BudgetDraft";
import { SessionProvider } from "@/real/service/Session";
import { colors } from "@/theme";

export default function DemoLayout() {
  // 모달이 폰 틀 안에서 열리도록 틀의 DOM 요소를 모달에 넘긴다
  const [phone, setPhone] = useState<HTMLElement | null>(null);
  return (
    <SafeAreaProvider>
      <View style={styles.outer}>
        <SafeAreaView
          ref={setPhone as unknown as (node: unknown) => void}
          style={styles.phone}
          edges={["top", "bottom"]}
        >
          <PhoneHostProvider value={phone}>
            <StatusBar style="dark" />
            <ToastProvider>
              <AppStoreProvider>
                <RealToastProvider>
                  <SessionProvider>
                    <BudgetDraftProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: colors.bg },
                        }}
                      />
                    </BudgetDraftProvider>
                  </SessionProvider>
                </RealToastProvider>
              </AppStoreProvider>
            </ToastProvider>
          </PhoneHostProvider>
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
});
