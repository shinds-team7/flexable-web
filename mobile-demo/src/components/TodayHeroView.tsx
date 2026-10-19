import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { T, useRollingNumber } from "./ui";
import { colors } from "@/theme";
import { diffDays, md, toKey } from "@/utils/date";
import { DOW, won } from "@/utils/format";
import { styles } from "./HomeStyles";
export type HeroSummary = {
  todayAvailable: number;
  cycleStart: Date;
  cycleEnd: Date;
  daysLeft: number;
  dailyLimit: number;
  todayWeight: number;
  todaySpent: number;
  todayPlanned: { title: string; amount: number }[];
};
export function TodayHeroView({
  today,
  summary: s,
  transactions = [],
  onDetails,
  caption,
  footerCaption,
  showCycle = true,
}: {
  today: Date;
  summary: HeroSummary;
  transactions?: {
    date: string;
    amount: number;
    merchant: string;
    time: string;
  }[];
  onDetails: () => void;
  /** null 이면 금액 아래 설명 줄을 숨긴다(초과했을 때 안내는 그대로) */
  caption?: string | null;
  footerCaption?: string;
  /** false 면 급여 주기 줄(칸·급여일·다음 수입일까지)을 숨긴다 */
  showCycle?: boolean;
}) {
  const lastPay = transactions.find(
    (t) => t.date === toKey(today) && t.amount < 0,
  );
  const over = s.todayAvailable < 0;
  const empty = s.todayAvailable <= 0;
  // Translucent white drops below 4.5:1 on the red panel, so small text goes solid white there.
  const sub = empty ? colors.onBrand : colors.onBrandSub;
  const shown = useRollingNumber(Math.max(0, s.todayAvailable));

  const totalDays = diffDays(s.cycleEnd, s.cycleStart) + 1;
  const todayIdx = diffDays(today, s.cycleStart);

  return (
    <View style={[styles.hero, empty && styles.heroEmpty]}>
      <View style={styles.heroTop}>
        <T size={15} weight="700" color={colors.onBrand}>
          오늘 쓸 수 있는 돈
        </T>
        <T size={13} weight="500" color={sub}>
          {today.getMonth() + 1}월 {today.getDate()}일 {DOW[today.getDay()]}요일
        </T>
      </View>

      <T
        size={38}
        weight="800"
        color={colors.onBrand}
        num
        style={{ marginTop: 6, lineHeight: 46 }}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`오늘 쓸 수 있는 돈 ${won(Math.max(0, s.todayAvailable))}원`}
      >
        {won(shown)}
        <T size={22} weight="700" color={colors.onBrand}>
          {" "}
          원
        </T>
      </T>

      {over ? (
        <T size={13} weight="600" color={colors.onBrand} style={{ marginTop: 2 }} num>
          오늘 {won(-s.todayAvailable)}원 넘게 썼어요. 남은 {s.daysLeft - 1}일에
          나눠서 반영할게요
        </T>
      ) : caption === null ? null : (
        <T size={13} color={sub} style={{ marginTop: 2 }} num>
          {caption ??
            `${DOW[today.getDay()]}요일 기준 ${won(s.dailyLimit)}원(${s.todayWeight}%) 중 ${won(s.todaySpent)}원 썼어요`}
        </T>
      )}
      {/* 급여 주기 스트립 */}
      {showCycle && (
        <View
          style={styles.cycle}
          accessible
          accessibilityLabel={`급여 주기 ${totalDays}일 중 ${todayIdx + 1}일째, 다음 수입일까지 ${s.daysLeft}일`}
        >
          <View style={styles.ticks}>
            {Array.from({ length: totalDays }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.tick,
                  i < todayIdx && styles.tickPast,
                  i < todayIdx && empty && styles.heroEmptyAccent,
                  i === todayIdx && styles.tickToday,
                ]}
              />
            ))}
          </View>
          <View style={styles.rowBetween}>
            <T size={12} color={sub} num>
              {md(s.cycleStart)} 급여
            </T>
            <T size={12} weight="700" color={colors.onBrand} num>
              다음 수입일까지 {s.daysLeft}일
            </T>
          </View>
        </View>
      )}

      {s.todayPlanned.length > 0 && (
        <View style={[styles.heroPlan, empty && styles.heroEmptyAccent]}>
          <Ionicons name="calendar" size={14} color={colors.onBrand} />
          <T
            size={13}
            weight="600"
            color={colors.onBrand}
            style={{ flex: 1 }}
            numberOfLines={2}
            num
          >
            {s.todayPlanned.map((x) => x.title).join(", ")}{" "}
            {won(s.todayPlanned.reduce((a, x) => a + x.amount, 0))}원은 미리
            빼뒀어요
          </T>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.heroFoot, pressed && { opacity: 0.7 }]}
        onPress={onDetails}
        accessibilityRole="button"
        accessibilityLabel="계산 근거 보기"
      >
        <T
          size={12}
          color={sub}
          numberOfLines={1}
          style={{ flex: 1 }}
          num
        >
          {footerCaption ??
            (lastPay
              ? `방금 ${lastPay.merchant} ${won(-lastPay.amount)}원 반영 (${lastPay.time})`
              : "오늘 05:00에 마지막으로 계산했어요")}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <T size={12} weight="700" color={colors.onBrand}>
            계산 근거
          </T>
          <Ionicons name="chevron-forward" size={14} color={colors.onBrand} />
        </View>
      </Pressable>
    </View>
  );
}
