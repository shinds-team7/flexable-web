import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { Button, Card, ConfirmModal, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { useToast } from "@/real/components/Toast";
import { colors } from "@/real/theme";
import { api, sessionGeneration } from "./api/client";
import { OPERATOR_NAME, WEBSITE_URL } from "./config";
import { ErrorNotice, Loading, parseTime, useResource } from "./ui";

type LinkCode = { code: string; expiresAt: string };

// Same items as section 4 of docs/play-store/privacy-policy.md and the website's policy; change together.
const CONSENT = [
  [
    "처리자",
    `강선후(운영 이름 ${OPERATOR_NAME}). 같은 운영자의 텅장관리 웹사이트(solpa.shinhanacademy.co.kr)에서 이용`,
  ],
  ["목적", "웹사이트에서 시드머니 표시와 투자·적금 실험"],
  [
    "항목",
    "연동 코드, 앱 계정 이메일·가입 방법, 연동 식별값, 연동·조회 일시, 시드머니(합계·모아둔 돈·매달 저축할 돈·마지막 반영·갱신 일시), 앱 사용 시작일(첫 하루 예산 기록일), 주기별 반영 기록(주기 종료일·반영 방법·금액·반영 후 합계·반영 일시). 반영 대기 정보와 거래 내역은 넘기지 않아요",
  ],
  [
    "보유 기간",
    "연동 해제, 앱 탈퇴, 웹사이트 탈퇴 때까지. 앱에서 해제하거나 탈퇴하면 웹사이트는 늦어도 다음 날 새벽에 지워요",
  ],
  [
    "거부할 권리",
    "동의하지 않을 수 있어요. 동의하지 않으면 웹사이트 연동만 쓸 수 없고 앱의 다른 기능은 그대로 쓸 수 있어요",
  ],
  ["철회 방법", "이 화면의 [연동 해제], 또는 웹사이트의 내 정보 화면"],
] as const;
type WebLink = { id: number; createdAt: string };

function linkedAt(value: string) {
  return parseTime(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
    hour12: false,
  });
}

export function WebLinksScreen() {
  const links = useResource<WebLink[]>("/me/web-links");
  const toast = useToast();
  const [code, setCode] = useState<LinkCode>();
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<WebLink | null>(null);
  const [confirmCode, setConfirmCode] = useState(false);
  // Optional consent starts unchecked and is asked again each time the screen opens.
  const [agreed, setAgreed] = useState(false);
  const lock = useRef(false);
  const focus = useRef(0);
  useFocusEffect(
    useCallback(() => {
      ++focus.current;
      return () => {
        ++focus.current;
        // The one-time code stays only on this screen, never in persistent storage.
        setCode(undefined);
        setSelected(null);
        setConfirmCode(false);
        setAgreed(false);
      };
    }, []),
  );
  useEffect(() => {
    if (!code) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [code]);

  const remaining = code
    ? Math.max(0, Math.ceil((parseTime(code.expiresAt).getTime() - now) / 1000))
    : 0;
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    const started = focus.current;
    const generation = sessionGeneration();
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      if (started === focus.current && generation === sessionGeneration())
        setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const issueCode = () => {
    setConfirmCode(false);
    void run(async () => {
      const started = focus.current;
      const generation = sessionGeneration();
      // Even if the response is lost, the server may have invalidated the old code.
      setCode(undefined);
      const issued = await api<LinkCode>("/me/web-link-codes", {
        method: "POST",
      });
      if (started !== focus.current || generation !== sessionGeneration())
        return;
      setNow(Date.now());
      setCode(issued);
    });
  };
  const unlink = () => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    void run(async () => {
      await api(`/me/web-links/${id}`, { method: "DELETE" });
      links.retry();
      toast("웹사이트 연동을 해제했어요");
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="웹사이트 연동" fallback="/profile" />
      <View style={{ flex: 1 }}>
        <WebLinksContent
          code={code}
          remaining={remaining}
          busy={busy}
          error={error}
          links={links}
          agreed={agreed}
          onAgree={setAgreed}
          onIssue={() =>
            code && remaining > 0 ? setConfirmCode(true) : issueCode()
          }
          onSelect={setSelected}
        />
      </View>
      <ConfirmModal
        visible={confirmCode}
        title="새 코드를 받을까요?"
        message="이전에 받은 코드는 더 이상 사용할 수 없어요"
        confirmLabel="새 코드 받기"
        onCancel={() => setConfirmCode(false)}
        onConfirm={issueCode}
      />
      <ConfirmModal
        visible={!!selected}
        title="웹사이트 연동을 해제할까요?"
        message="해제하면 웹사이트에서 이 앱 계정의 회원 정보와 시드머니를 새로 불러올 수 없어요. 앱에 입력한 기록은 그대로 남아요"
        confirmLabel="연동 해제"
        onCancel={() => setSelected(null)}
        onConfirm={unlink}
      />
    </View>
  );
}

function WebLinksContent({
  code,
  remaining,
  busy,
  error,
  links,
  agreed,
  onAgree,
  onIssue,
  onSelect,
}: {
  agreed: boolean;
  onAgree: (agreed: boolean) => void;
  code?: LinkCode;
  remaining: number;
  busy: boolean;
  error: unknown;
  links: ReturnType<typeof useResource<WebLink[]>>;
  onIssue: () => void;
  onSelect: (link: WebLink) => void;
}) {
  const [openError, setOpenError] = useState<unknown>();
  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <T size={20} weight="800">
          앱과 웹사이트 연결하기
        </T>
        <T color={colors.textSub} style={{ lineHeight: 22 }}>
          웹사이트에서 로그인한 뒤 [앱 연동하기]에 아래 코드를 입력해 주세요.
          코드를 받으려면 아래 개인정보 수집·이용에 동의해 주세요
        </T>
        <View
          style={{
            gap: 6,
            padding: 14,
            backgroundColor: colors.bg,
            borderRadius: 12,
          }}
        >
          {CONSENT.map(([label, text]) => (
            <T key={label} size={13} style={{ lineHeight: 20 }}>
              <T size={13} weight="700">
                {label}
              </T>
              {"  "}
              {text}
            </T>
          ))}
        </View>
        <Button
          label="개인정보처리방침 보기"
          variant="ghost"
          onPress={() => router.push("/privacy")}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="선택 웹사이트 연동 개인정보 수집·이용 동의"
          accessibilityState={{ checked: agreed }}
          aria-checked={agreed}
          onPress={() => onAgree(!agreed)}
          style={{ paddingVertical: 12 }}
        >
          <T>
            {agreed ? "☑" : "☐"} (선택) 웹사이트 연동 개인정보 수집·이용 동의
          </T>
        </Pressable>
        <T size={13} color={colors.textMuted}>
          코드는 10분 동안 한 번만 사용할 수 있어요. 본인이 로그인한
          웹사이트에만 입력해 주세요
        </T>
        {code && remaining > 0 && (
          <View
            style={{
              padding: 20,
              gap: 8,
              backgroundColor: colors.brandSoft,
              borderRadius: 16,
            }}
          >
            <T
              size={28}
              weight="800"
              num
              selectable
              style={{ textAlign: "center" }}
            >
              {code.code}
            </T>
            <T size={13} num style={{ textAlign: "center" }}>
              {Math.floor(remaining / 60)}분{" "}
              {String(remaining % 60).padStart(2, "0")}초 남았어요
            </T>
            <Button
              label="웹사이트에서 연동하기"
              icon="open-outline"
              onPress={() => {
                setOpenError(undefined);
                Linking.openURL(WEBSITE_URL).catch(() =>
                  setOpenError(
                    "웹사이트를 열지 못했어요. 잠시 후 다시 시도해 주세요",
                  ),
                );
              }}
            />
            <T size={12}>
              solpa.shinhanacademy.co.kr에서 로그인한 뒤 코드를 입력해 주세요
            </T>
            <ErrorNotice error={openError} />
          </View>
        )}
        {code && remaining === 0 && (
          <T color={colors.textMuted}>
            코드가 만료됐어요. 새 코드를 받아 주세요
          </T>
        )}
        <Button
          label={
            busy ? "처리 중이에요" : code ? "새 코드 받기" : "웹 연동 코드 받기"
          }
          disabled={busy || !agreed}
          onPress={onIssue}
        />
      </Card>
      <ErrorNotice error={error} />
      <Card style={{ gap: 12 }}>
        <T size={18} weight="700">
          연동된 웹사이트
        </T>
        <T size={13} color={colors.textMuted}>
          웹사이트에서 코드 입력을 마쳤다면 새로고침해 주세요
        </T>
        <Button
          label="연동 목록 새로고침"
          variant="soft"
          disabled={busy || links.loading}
          onPress={links.retry}
        />
        <ErrorNotice error={links.error} retry={links.retry} />
        {links.loading ? (
          <Loading />
        ) : !links.error && links.data?.length === 0 ? (
          <T color={colors.textMuted}>연동된 웹사이트가 없어요</T>
        ) : null}
        {!links.loading &&
          links.data?.map((link) => (
            <View
              key={link.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 12,
                gap: 6,
              }}
            >
              <T weight="600">웹사이트 연동 #{link.id}</T>
              <T size={13} color={colors.textMuted}>
                연동일: {linkedAt(link.createdAt)} (한국 시간)
              </T>
              <Button
                label={`연동 #${link.id} 해제`}
                variant="ghost"
                disabled={busy || !!links.error}
                onPress={() => onSelect(link)}
              />
            </View>
          ))}
      </Card>
    </Screen>
  );
}
