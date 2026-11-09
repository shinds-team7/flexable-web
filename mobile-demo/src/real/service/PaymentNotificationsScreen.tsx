import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Button, Card, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { colors } from "@/real/theme";
import { useSession } from "./Session";
import { useToast } from "@/real/components/Toast";
import { ErrorNotice } from "./ui";
import {
  demoReceivePayment,
  mutatePaymentCollection,
  paymentNative,
} from "./paymentNotifications/native";
import { sessionGeneration } from "./api/client";
import {
  refreshPaymentImport,
  interruptPaymentImport,
  usePaymentImportState,
} from "./paymentNotifications/usePaymentImport";

export function PaymentNotificationsScreen() {
  const { user } = useSession();
  const owner = user ? String(user.id) : undefined;
  const data = usePaymentImportState();
  const toast = useToast();
  const [agreement, setAgreement] = useState<{
    owner?: string;
    accepted: boolean;
  }>({ accepted: false });
  const consent = agreement.owner === owner && agreement.accepted;
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  // 시연: 웹에서도 가짜 수집기(paymentNotifications/native.ts)로 보여 준다
  const available = !!paymentNative;
  const status = data.owner === owner ? data.status : undefined;
  const problems = data.owner === owner ? data.problems : [];
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    const generation = sessionGeneration();
    interruptPaymentImport();
    setBusy(true);
    setError(undefined);
    try {
      await mutatePaymentCollection(
        fn,
        () => generation === sessionGeneration(),
      );
      refreshPaymentImport();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="신한카드 자동 기록" fallback="/profile" />
      <Screen>
        <Card style={{ gap: 14 }}>
          <T weight="800" size={19}>
            결제 알림을 거래로 기록해요
          </T>
          <T>
            신한 SOL페이의 국내 원화 승인 알림을 읽어요. 앱을 열면 모인 알림을
            지출의 기타 카테고리로 자동 기록하며, 내역에서 고치거나 지울 수
            있어요.
          </T>
          <T>
            취소·해외 이용·읽지 못한 알림과 중복이 의심되는 거래는 자동으로
            기록하거나 지우지 않아요. 아래 확인 목록을 보고 직접 기록을 수정해
            주세요.
          </T>
          {!available ? (
            <T>
              Android 새 버전에서 사용할 수 있어요. 이 앱에는 아직 알림 수집
              기능이 포함되지 않았어요.
            </T>
          ) : (
            <>
              <T>
                수집: {status?.enabled ? "켜짐" : "꺼짐"} · 알림 접근:{" "}
                {status?.allowed ? "허용" : "허용 필요"}
              </T>
              {status?.enabled && !status.connected && (
                <T>
                  알림 연결을 기다리고 있어요. 알림 접근 설정을 확인해 주세요.
                </T>
              )}
              <T>
                선택한 앱의 알림 제목·본문·시각만 기기에서 암호화해 최대 200개
                보관해요. 7일 지난 대기 알림은 다음 앱 실행이나 수집 처리에서
                지워요. 거래로 반영하면 원문을 지우고, 서버에는
                금액·가맹점·일시·카테고리만 기록해요. 저장된 거래는 직접
                삭제하거나 회원 탈퇴할 때까지 보관해요. 다른 앱
                알림·카드번호·이름은 서버로 보내지 않아요.
              </T>
              <T>
                Android 알림 접근 화면은 다른 앱 알림에도 접근할 수 있다고
                안내하지만, 텅장관리는 신한 SOL페이 알림만 처리해요. 동의하지
                않아도 나머지 기능은 사용할 수 있어요. 끄거나 로그아웃하면
                수집과 미반영 원문 보관을 중단해요.
              </T>
              {!status?.enabled && (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel="선택 신한카드 알림 자동 기록 개인정보 수집·이용 동의"
                  accessibilityState={{ checked: consent }}
                  aria-checked={consent}
                  onPress={() => setAgreement({ owner, accepted: !consent })}
                  hitSlop={8}
                  style={{
                    minHeight: 56,
                    paddingVertical: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={consent ? "checkbox" : "square-outline"}
                    size={30}
                    color={consent ? colors.brand : colors.textSub}
                  />
                  <T style={{ flex: 1 }}>
                    (선택) 위 내용을 확인하고 자동 기록에 동의해요
                  </T>
                </Pressable>
              )}
              <Button
                variant="soft"
                label="Android 알림 접근 설정 열기"
                disabled={busy || (!consent && !status?.enabled)}
                onPress={() => act(() => paymentNative!.openSettings())}
              />
              {status?.enabled ? (
                <Button
                  variant="soft"
                  label="자동 기록 끄고 대기 알림 지우기"
                  disabled={busy}
                  onPress={() =>
                    act(async () => {
                      await paymentNative!.configure(owner!, false);
                      setAgreement({ owner, accepted: false });
                    })
                  }
                />
              ) : (
                <Button
                  label="동의하고 자동 기록 켜기"
                  disabled={busy || !owner || !consent || !status?.allowed}
                  onPress={() =>
                    act(() => paymentNative!.configure(owner!, true))
                  }
                />
              )}
              {status?.enabled && status.allowed && (
                <Button
                  icon="notifications-outline"
                  label="시연: 신한카드 결제 알림 받기"
                  disabled={busy}
                  onPress={() => {
                    demoReceivePayment();
                    toast("결제 알림을 받았어요. 지출로 기록하는 중이에요");
                  }}
                />
              )}
              <Button
                variant="soft"
                label="개인정보처리방침 보기"
                onPress={() => router.push("/privacy")}
              />
              {!!status?.dropped && (
                <T>
                  보관 기간 또는 개수 제한으로 처리하지 못한 알림{" "}
                  {status.dropped}개가 있어요. 거래내역을 확인해 주세요.
                </T>
              )}
            </>
          )}
          <ErrorNotice
            error={error ?? (data.owner === owner ? data.error : undefined)}
            retry={refreshPaymentImport}
          />
          {available && !!(error ?? data.error) && (
            <Button
              variant="soft"
              label="수집 끄고 이 기기의 대기 알림 초기화"
              disabled={busy}
              onPress={() => act(() => paymentNative!.clear())}
            />
          )}
        </Card>
        {problems.map((item) => (
          <Card key={item.id} style={{ gap: 10 }}>
            <T>{item.reason}</T>
            <T>
              받은 시각:{" "}
              {new Date(item.postedAt + 9 * 3600000)
                .toISOString()
                .slice(5, 16)
                .replace("T", " ")}
            </T>
            <Button
              variant="soft"
              label="거래내역 열기"
              onPress={() => router.push("/transactions")}
            />
            <T>
              신한 SOL페이 이용내역과 텅장관리 거래내역을 대조한 뒤 직접
              기록하거나 수정해 주세요.
            </T>
            <Button
              variant="soft"
              label="확인했어요 · 이 알림 제외"
              disabled={busy}
              onPress={() =>
                act(() => paymentNative!.acknowledge(owner!, item.id))
              }
            />
          </Card>
        ))}
      </Screen>
    </View>
  );
}
