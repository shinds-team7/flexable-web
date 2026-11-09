import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/real/theme";
import { useGuideTarget } from "./guideTargets";
import { T } from "./ui";
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Image
      source={require("../../../assets/real/logo.png")}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    />
  );
}
/** right: 오른쪽 끝에 놓을 버튼(없으면 로고 줄만) */
export function AppHeaderView({
  homeHref,
  right,
}: {
  homeHref: Href;
  right?: ReactNode;
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
        </Pressable>
        {right}
      </View>
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>["name"];

/** 하단 탭바 — 아이콘 아래 라벨을 함께 보여 준다. 선택된 탭만 신한 블루. middle은 탭 가운데에 끼우는 버튼 */
export function BottomTabBar({
  tabs,
  pathname,
  middle,
}: {
  tabs: {
    href: Href;
    label: string;
    icon: IconName;
    activeIcon: IconName;
    match: (p: string) => boolean;
  }[];
  pathname: string;
  middle?: ReactNode;
}) {
  const half = Math.ceil(tabs.length / 2);
  return (
    <View style={styles.bottom} accessibilityRole="tablist">
      {tabs.map((t, i) => {
        const tab = (
          <BottomTab key={t.label} tab={t} on={t.match(pathname)} />
        );
        return i === half - 1 && middle ? (
          <Fragment key={t.label}>
            {tab}
            <View style={styles.bottomTab}>{middle}</View>
          </Fragment>
        ) : (
          tab
        );
      })}
    </View>
  );
}

/** 탭 하나. 사용 가이드가 "tab:내역"처럼 라벨로 가리킨다 */
function BottomTab({
  tab: t,
  on,
}: {
  tab: { href: Href; label: string; icon: IconName; activeIcon: IconName };
  on: boolean;
}) {
  const guide = useGuideTarget(`tab:${t.label}`);
  return (
    <Pressable
      ref={guide}
      style={styles.bottomTab}
      accessibilityRole="tab"
      accessibilityLabel={t.label}
      accessibilityState={{ selected: on }}
      onPress={() => router.navigate(t.href)}
    >
      <Ionicons
        name={on ? t.activeIcon : t.icon}
        size={24}
        color={on ? colors.brand : colors.textMuted}
      />
      <T
        size={12}
        weight={on ? "700" : "500"}
        color={on ? colors.brand : colors.textMuted}
      >
        {t.label}
      </T>
    </Pressable>
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
  bottom: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 8,
    // 시스템 내비게이션 바를 숨겨 화면 맨 아래에 붙으므로 아래쪽에 손가락 여백을 둔다(11-08)
    paddingTop: 4,
    paddingBottom: 12,
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 64,
    paddingVertical: 8,
  },
});
