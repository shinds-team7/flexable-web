import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  ConfirmModal,
  Row,
  Screen,
  SwitchMark,
  T,
} from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { colors } from "@/real/theme";
import { ApiError, api, sessionGeneration } from "./api/client";
import { getReferral, registerReferral } from "./coinApi";
import { APP_VERSION, SUPPORT_EMAIL } from "./config";
import {
  useBudgetNotificationSetting,
  useEntryReminderSetting,
  useEntryReminderTime,
  useSeedReminderSetting,
} from "./reminderSetting";
import {
  EntryReminderTimeSheet,
  reminderTimeText,
} from "./EntryReminderTimeSheet";
import { markHomeGuidePending } from "./HomeGuide";
import { useSession } from "./Session";
import { ErrorNotice, Field } from "./ui";
import { PROVIDER_NAME } from "./oauth";
import type { Referral, User } from "./types";
import { publishWallet } from "./wallet";
/** 이메일, 그리고 카카오·Google 계정이면 어느 계정으로 로그인했는지 */
export function AccountLine({ user }: { user: User }) {
  const social =
    user.provider === "kakao" || user.provider === "google"
      ? `${PROVIDER_NAME[user.provider]} 계정으로 로그인 중`
      : null;
  return (
    <>
      <T style={{ marginTop: 8 }}>{user.email ?? social}</T>
      {user.email && social && (
        <T size={13} color={colors.textMuted} style={{ marginTop: 4 }}>
          {social}
        </T>
      )}
    </>
  );
}
/** 내 추천 코드와 친구 코드 입력. 코인·상점은 캐릭터 홈 코인 칩 → 코인 내역의 상점 버튼으로만 들어간다. 코인 API가 없는 서버(1.4.0 이전)에서는 보이지 않는다 */
function ReferralCard() {
  const toast = useToast();
  const [referral, setReferral] = useState<Referral>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  // 추천 코드는 평소에는 접어 두고 눌러서 펼친다
  const [open, setOpen] = useState(false);
  const lock = useRef(false);
  const focus = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const seq = ++focus.current;
      const generation = sessionGeneration();
      const fresh = () =>
        seq === focus.current && generation === sessionGeneration();
      getReferral()
        .then((r) => fresh() && setReferral(r))
        .catch(() => {});
      return () => {
        ++focus.current;
      };
    }, []),
  );
  if (!referral) return null;
  const share = async () => {
    try {
      await Share.share({
        message: `텅장관리 앱에서 내 추천 코드 ${referral.code}를 입력하면 앱에서만 쓰는 코인 ${referral.rewardAmount}개를 받아요`,
      });
    } catch {
      toast("공유하지 못했어요");
    }
  };
  const register = async () => {
    if (lock.current || !code.trim()) return;
    lock.current = true;
    const generation = sessionGeneration();
    setBusy(true);
    setError(undefined);
    try {
      const result = await registerReferral(code.trim());
      if (generation !== sessionGeneration()) return;
      publishWallet(result.wallet, generation);
      setReferral((r) => r && { ...r, registered: true });
      setCode("");
      toast(`코인 ${result.amount}개를 받았어요`);
    } catch (e) {
      if (generation === sessionGeneration())
        // 서버 문구는 두 경우를 한 줄로 말하므로(코드 확인 + 내 코드 불가), 입력한 코드에 맞는 쪽만 보여 준다
        setError(
          e instanceof ApiError && e.code === "REFERRAL_CODE_INVALID"
            ? code.trim().toUpperCase() === referral.code.toUpperCase()
              ? "내 코드는 등록할 수 없어요"
              : "추천 코드를 확인해 주세요"
            : e,
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Card style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="추천 코드"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={styles.groupHead}
      >
        <T size={14} weight="700" color={colors.textSub} style={{ flex: 1 }}>
          추천 코드
        </T>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>
      {open && (
        <View style={styles.referral}>
          <T size={22} weight="800" num selectable>
            {referral.code}
          </T>
          <T size={13} color={colors.textMuted}>
            친구가 코드를 입력하면 나와 친구가 코인 {referral.rewardAmount}개씩
            받아요 (지금까지 {referral.invitedCount}명)
          </T>
          <Button label="추천 코드 공유" variant="soft" onPress={share} />
          {!referral.registered && (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Field
                label="친구에게 받은 추천 코드"
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
              />
              <ErrorNotice error={error} />
              <Button
                label={busy ? "등록 중이에요" : "추천 코드 등록"}
                disabled={busy || !code.trim()}
                onPress={register}
              />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
export function MyScreen() {
  const session = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  // Turning it off cancels the scheduled reminder; the home screen reschedules when it is back on.
  const [remind, setRemind] = useSeedReminderSetting();
  // Same for the reminder to record; the service layout reschedules it.
  const [remindEntry, setRemindEntry] = useEntryReminderSetting();
  // 알림창 상시 알림. 끄면 지우고, 켜면 서비스 레이아웃이 다시 띄운다.
  const [showBudget, setShowBudget] = useBudgetNotificationSetting();
  const [entryTime, setEntryTime] = useEntryReminderTime();
  const [timeSheet, setTimeSheet] = useState(false);
  // 시트를 열 때마다 새로 만들어 저장하지 않은 선택이 남지 않게 한다
  const [timeSheetKey, setTimeSheetKey] = useState(0);
  const logout = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setConfirm(false);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      toast("이 기기에서 로그아웃했어요. 다른 기기의 상태는 확인하지 못했어요");
    } finally {
      try {
        await session.clear();
        router.replace("/");
      } catch (e) {
        setError(e);
      }
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={24} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={17} weight="700">
            내 계정
          </T>
          {session.user && <AccountLine user={session.user} />}
        </View>
      </Card>
      <ReferralCard />
      {/* 시연: 실제 앱에서는 Android에서만 보인다 */}
      {(
        <Card style={styles.group}>
          <Row
            first
            label="신한카드 자동 기록"
            caption="결제 알림을 읽어 지출로 기록해요"
            onPress={() => router.push("/payment-notifications")}
          />
        </Card>
      )}
      {/* 시연: 실제 앱에서는 기기 알림이 있는 앱에서만 보인다 */}
      {(
        <Card style={styles.group}>
          <Row
            first
            label="수입일 전날 알림"
            caption="시드머니를 반영할 때 알려 드려요"
            accessibilityRole="switch"
            accessibilityState={{ checked: remind }}
            aria-checked={remind}
            right={<SwitchMark on={remind} />}
            onPress={() => setRemind(!remind)}
          />
          <Row
            label="알림창에 오늘 남은 예산"
            caption="알림창을 내리면 남은 예산을 볼 수 있어요"
            accessibilityRole="switch"
            accessibilityState={{ checked: showBudget }}
            aria-checked={showBudget}
            right={<SwitchMark on={showBudget} />}
            onPress={() => setShowBudget(!showBudget)}
          />
          <Row
            label="기록 알림"
            caption="24시간 동안 기록이 없으면 알려 드려요"
            accessibilityRole="switch"
            accessibilityState={{ checked: remindEntry }}
            aria-checked={remindEntry}
            right={<SwitchMark on={remindEntry} />}
            onPress={() => setRemindEntry(!remindEntry)}
          />
          {remindEntry && (
            <Row
              label="기록 알림 시간"
              caption={
                entryTime
                  ? `기록이 없는 날 ${reminderTimeText(entryTime)}에 알려 드려요`
                  : "자동: 마지막 기록 24시간 뒤"
              }
              onPress={() => {
                setTimeSheetKey((k) => k + 1);
                setTimeSheet(true);
              }}
            />
          )}
          {/* 신한카드 자동 기록은 알림 설정과 같은 카드, 기록 알림 시간 아래 */}
          {Platform.OS === "android" && (
            <Row
              label="신한카드 자동 기록"
              caption="결제 알림을 읽어 지출로 기록해요"
              onPress={() => router.push("/payment-notifications")}
            />
          )}
        </Card>
      )}
      <Card style={styles.group}>
        {(
          [
            ["예산 설정 바꾸기", "/budget/settings"],
            ["카테고리 관리", "/categories"],
            ["웹사이트 연동", "/web-links"],
            ["고객지원", "/support"],
            ["서비스 이용약관", "/terms"],
            ["개인정보처리방침", "/privacy"],
          ] as const
        ).map(([label, href], i) => (
          <Row
            key={href}
            first={i === 0}
            label={label}
            onPress={() => router.push(href)}
          />
        ))}
        {session.user && (
          <Row
            label="사용 가이드 다시 보기"
            onPress={() => {
              const id = session.user?.id;
              if (id === undefined) return;
              // 홈이 다시 보일 때 가이드를 연다(service/HomeGuide)
              void markHomeGuidePending(id).then(() => router.navigate("/home"));
            }}
          />
        )}
      </Card>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <T size={13} color={colors.textMuted}>
          앱 버전 {APP_VERSION}
        </T>
        <T size={13} color={colors.textMuted}>
          문의: {SUPPORT_EMAIL}
        </T>
      </View>
      <ErrorNotice error={error} />
      <Button
        label="로그아웃 (시연 처음부터 다시 보기)"
        variant="soft"
        disabled={busy}
        onPress={() => setConfirm(true)}
      />
      <Button
        label="계정 삭제"
        style={styles.deleteAccount}
        onPress={() => router.push("/account/delete")}
      />
      {Platform.OS !== "web" && (
        <EntryReminderTimeSheet
          key={timeSheetKey}
          visible={timeSheet}
          time={entryTime}
          onClose={() => setTimeSheet(false)}
          onChange={setEntryTime}
        />
      )}
      <ConfirmModal
        visible={confirm}
        title="로그아웃할까요?"
        message="시연에서는 예시 데이터를 지우고 첫 화면으로 돌아가요"
        confirmLabel="로그아웃"
        onCancel={() => setConfirm(false)}
        onConfirm={logout}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { padding: 0, overflow: "hidden" },
  referral: { gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  // 로그아웃 버튼(파랑 박스·흰 글자)과 같은 크기의 짙은 회색 박스
  deleteAccount: { backgroundColor: "#4B5563" },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
});
