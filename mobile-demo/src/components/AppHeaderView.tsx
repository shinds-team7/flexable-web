import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/theme";
import { T } from "./ui";
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/brand/logo.png")}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    />
  );
}
export function AppHeaderView({
  tabs,
  pathname,
  homeHref,
  pendingCount = 0,
  onNotifications,
  showTabs = true,
}: {
  tabs: { href: Href; label: string; match: (p: string) => boolean }[];
  pathname: string;
  homeHref: Href;
  pendingCount?: number;
  onNotifications?: () => void;
  /** false 면 로고 줄만 그리고 탭은 BottomTabBar 에 맡긴다 */
  showTabs?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable
          style={styles.brand}
          onPress={() => router.navigate(homeHref)}
          accessibilityRole="link"
          accessibilityLabel="텅장관리 홈"
        >
          <Logo />
          <T size={18} weight="800">
            텅장관리
          </T>
          <T
            size={12}
            weight="700"
            color={colors.brand}
            style={{ marginTop: 2 }}
          >
            flex-able
          </T>
        </Pressable>
        {onNotifications && (
          <Pressable
            style={({ pressed }) => [
              styles.actions,
              pressed && { backgroundColor: colors.sunken },
            ]}
            onPress={onNotifications}
            accessibilityRole="button"
            accessibilityLabel={
              pendingCount > 0 ? `알림, 확인할 일 ${pendingCount}건` : "알림"
            }
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.textSub}
            />
            {pendingCount > 0 && <View style={styles.dot} />}
          </Pressable>
        )}
      </View>
      {showTabs && (
        <View style={styles.nav} accessibilityRole="tablist">
          {tabs.map((t) => {
            const on = t.match(pathname);
            return (
              <Pressable
                key={t.label}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => router.navigate(t.href)}
              >
                <T
                  size={15}
                  weight={on ? "700" : "500"}
                  color={on ? colors.text : colors.textMuted}
                  numberOfLines={1}
                >
                  {t.label}
                </T>
                <View
                  style={[
                    styles.indicator,
                    on && { backgroundColor: colors.brand },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>["name"];

/** 하단 아이콘 탭바 — 글자 대신 아이콘만 보이고, 라벨은 스크린리더용으로 남긴다 */
export function BottomTabBar({
  tabs,
  pathname,
}: {
  tabs: {
    href: Href;
    label: string;
    icon: IconName;
    activeIcon: IconName;
    match: (p: string) => boolean;
  }[];
  pathname: string;
}) {
  return (
    <View style={styles.bottom} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.match(pathname);
        return (
          <Pressable
            key={t.label}
            style={styles.bottomTab}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(t.href)}
          >
            <Ionicons
              name={on ? t.activeIcon : t.icon}
              size={26}
              color={on ? colors.brand : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  top: {
    height: 56,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -10,
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  nav: { flexDirection: "row", paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: "center", paddingTop: 8, minHeight: 44 },
  indicator: {
    height: 3,
    width: 28,
    borderRadius: 2,
    marginTop: 9,
    backgroundColor: "transparent",
  },
  bottom: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 8,
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
});
