import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { AppHeaderView, BottomTabBar } from "@/real/components/AppHeaderView";
import { colors, pressTransition } from "@/real/theme";
import { AddTransactionSheet } from "./AddTransactionSheet";
import { useInbox } from "./inbox";
import { useGuideTarget } from "@/real/components/guideTargets";
import { useServerExtensions } from "./serverExtensions";
const tabs = [
  {
    href: "/home" as const,
    label: "홈",
    icon: "home-outline" as const,
    activeIcon: "home" as const,
    match: (p: string) => p === "/home",
  },
  {
    href: "/transactions" as const,
    label: "내역",
    icon: "receipt-outline" as const,
    activeIcon: "receipt" as const,
    match: (p: string) => p === "/transactions",
  },
  {
    href: "/analysis" as const,
    label: "분석",
    icon: "stats-chart-outline" as const,
    activeIcon: "stats-chart" as const,
    match: (p: string) => p === "/analysis",
  },
  {
    href: "/profile" as const,
    label: "마이",
    icon: "person-outline" as const,
    activeIcon: "person" as const,
    match: (p: string) => p === "/profile",
  },
];
// Tabs live in the bottom icon bar for every home style; the header keeps the logo row and the inbox bell.
// The shop is reached from the coin history, opened by the coin chip on the character home.
export function ServiceHeader() {
  const extensions = useServerExtensions();
  return (
    <AppHeaderView
      homeHref="/home"
      right={
        <View style={styles.right}>
          {extensions.available && <ChatbotButton />}
          <InboxButton />
        </View>
      }
    />
  );
}
/** AI 메이트(챗봇)로 간다. 처음이면 메이트 스타일 선택부터 뜬다 */
function ChatbotButton() {
  const guide = useGuideTarget("ai");
  return (
    <Pressable
      ref={guide}
      accessibilityRole="button"
      accessibilityLabel="AI 메이트"
      onPress={() => router.push("/chatbot")}
      hitSlop={6}
      style={styles.iconBtn}
    >
      <RobotIcon size={26} />
    </Pressable>
  );
}
/** AI 메이트 버튼의 로봇 아이콘(테두리는 글자색, 얼굴 화면은 브랜드색) */
export function RobotIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={2.8} r={1.2} stroke={colors.text} strokeWidth={1.5} />
      <Path
        d="M12 4v2"
        stroke={colors.text}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Rect
        x={4}
        y={6}
        width={16}
        height={11}
        rx={3.5}
        stroke={colors.text}
        strokeWidth={1.6}
      />
      <Rect x={2} y={9.5} width={2} height={4} rx={1} fill={colors.text} />
      <Rect x={20} y={9.5} width={2} height={4} rx={1} fill={colors.text} />
      <Rect
        x={6.6}
        y={8.6}
        width={10.8}
        height={5.8}
        rx={2}
        fill={colors.brand}
      />
      <Rect x={9} y={10.4} width={1.6} height={2.2} rx={0.8} fill="#fff" />
      <Rect x={13.4} y={10.4} width={1.6} height={2.2} rx={0.8} fill="#fff" />
      <Path
        d="M7.5 21.5v-1.3a2.2 2.2 0 0 1 2.2-2.2h4.6a2.2 2.2 0 0 1 2.2 2.2v1.3"
        stroke={colors.text}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}
/** 알림함으로 간다. 안 읽은 알림이 있으면 점을 찍는다 */
function InboxButton() {
  const { unread } = useInbox();
  const guide = useGuideTarget("inbox");
  return (
    <Pressable
      ref={guide}
      accessibilityRole="button"
      accessibilityLabel={unread ? "알림함, 새 알림 있음" : "알림함"}
      onPress={() => router.push("/notifications")}
      hitSlop={6}
      style={styles.bell}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {unread && <View style={styles.dot} />}
    </Pressable>
  );
}
export function ServiceTabBar() {
  const pathname = usePathname();
  return (
    <BottomTabBar tabs={tabs} pathname={pathname} middle={<RecordButton />} />
  );
}
/** Sits between 내역 and 분석 on every tab, so recording is one tap from anywhere. It opens the choice of image upload or manual entry. */
function RecordButton() {
  const [open, setOpen] = useState(false);
  const guide = useGuideTarget("record");
  return (
    <>
      <Pressable
        ref={guide}
        accessibilityRole="button"
        accessibilityLabel="거래 추가"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.record,
          pressTransition,
          pressed && styles.recordPressed,
        ]}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
      <AddTransactionSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
const styles = StyleSheet.create({
  right: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: {
    width: 48,
    height: 48,
    marginRight: -12,
    alignItems: "center",
    justifyContent: "center",
  },
  // Same unread dot as the shop button in the coin history.
  dot: {
    position: "absolute",
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: colors.danger,
  },
  record: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  recordPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: colors.brandDark,
  },
});
