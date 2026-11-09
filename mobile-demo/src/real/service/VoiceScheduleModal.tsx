import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button, Sheet, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { colors } from "@/real/theme";
import { won } from "@/real/utils/format";
import { api, ApiError, sessionGeneration } from "./api/client";
import { ScheduleCard, type ScheduleSubmit } from "./ScheduleCard";
import { confirmSpeech } from "./scheduleDraft";
import { useSession } from "./Session";
import { readStorage } from "./storage";
import type { ChatRequest, ChatResponse } from "./types";
import { useVoiceInput } from "./voiceInput";
import { speak, stopSpeaking, useVoiceReply } from "./voiceReply";

type Schedule = NonNullable<NonNullable<ChatResponse["action"]>["schedule"]>;
type State =
  | { kind: "listening" }
  | { kind: "thinking"; heard: string }
  | { kind: "card"; heard: string; schedule: Schedule }
  | { kind: "saving"; heard: string; schedule: Schedule }
  | { kind: "message"; heard?: string; text: string };

const MATES = ["ANALYST", "FRIEND", "COACH"] as const;

/**
 * + 시트의 [음성 입력]. 열리면 바로 마이크가 켜지고(빨간 멈춤 버튼), 들은 문장을 AI 메이트(POST /chat/messages,
 * accepts SCHEDULE)에 보내 예정 지출 제안을 받는다. 결과는 대화와 같은 한 줄 카드 + [반영 | 수정]이고,
 * 누른 뒤에만 POST /scheduled-expenses로 저장한다(실제 거래가 아니라 예정 지출).
 */
export function VoiceScheduleModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // 시트는 늘 두고(열고 닫는 움직임), 안의 내용은 열릴 때마다 처음부터(바로 듣기) 시작하도록 열렸을 때만 그린다
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="음성 입력"
      subtitle="날짜와 할 일을 말하면 예정 지출로 등록해요. 예: 금요일에 친구랑 저녁"
    >
      {visible ? <VoiceSchedule onClose={onClose} /> : <View />}
    </Sheet>
  );
}

function VoiceSchedule({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const toast = useToast();
  const voiceReply = useVoiceReply();
  const [state, setState] = useState<State>({ kind: "listening" });
  const heard = useRef("");
  const sent = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const onText = useCallback((text: string) => {
    heard.current = text;
  }, []);
  const voice = useVoiceInput(onText);

  const listen = useCallback(() => {
    heard.current = "";
    sent.current = false;
    stopSpeaking();
    setState({ kind: "listening" });
    void voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.start]);

  // 열리면 바로 듣는다
  useEffect(() => {
    alive.current = true;
    void voice.start();
    return () => {
      alive.current = false;
      controller.current?.abort();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useCallback(
    async (text: string) => {
      setState({ kind: "thinking", heard: text });
      const generation = sessionGeneration();
      const c = new AbortController();
      controller.current = c;
      try {
        const saved = (
          await readStorage("chatbot.mate").catch(() => null)
        )?.toUpperCase();
        const mate = MATES.find((m) => m === saved) ?? "ANALYST";
        const body: ChatRequest = {
          mate,
          accepts: ["SCHEDULE"],
          messages: [{ role: "USER", text: text.slice(0, 1000) }],
        };
        const result = await api<ChatResponse>("/chat/messages", {
          method: "POST",
          body,
          timeoutMs: 40000,
          signal: c.signal,
        });
        if (!alive.current || generation !== sessionGeneration()) return;
        const schedule =
          result.action?.type === "SCHEDULE"
            ? result.action.schedule
            : undefined;
        if (schedule) {
          setState({ kind: "card", heard: text, schedule });
          if (voiceReply.on) speak(confirmSpeech(schedule));
        } else {
          setState({
            kind: "message",
            heard: text,
            text: "말씀에서 예정 지출로 등록할 일정을 찾지 못했어요. 날짜와 할 일을 함께 말해 주세요.\n예: 금요일에 친구랑 저녁",
          });
        }
      } catch (e) {
        if (!alive.current || generation !== sessionGeneration()) return;
        setState({ kind: "message", heard: text, text: failText(e) });
      }
    },
    [voiceReply.on],
  );

  // 말이 끝나면(듣기가 멈추면) 들은 문장을 보낸다. 못 알아들었으면 안내를 보여 준다
  useEffect(() => {
    if (state.kind !== "listening" || voice.status !== "idle") return;
    if (sent.current) return;
    if (heard.current.trim()) {
      sent.current = true;
      void ask(heard.current.trim());
    } else if (voice.notice) {
      setState({ kind: "message", text: voice.notice });
    }
  }, [voice.status, voice.notice, state.kind, ask]);

  const register = async (schedule: Schedule, v: ScheduleSubmit) => {
    if (state.kind !== "card") return;
    stopSpeaking();
    setState({ kind: "saving", heard: state.heard, schedule });
    try {
      await api("/scheduled-expenses", {
        method: "POST",
        body: {
          amount: v.amount,
          categoryId: v.categoryId,
          title: schedule.title,
          date: v.date,
        },
      });
      session.invalidate();
      toast(`${won(v.amount)}원을 예정 지출로 등록했어요`);
      onClose();
    } catch (e) {
      if (!alive.current) return;
      setState({ kind: "card", heard: state.heard, schedule });
      toast(failText(e));
    }
  };

  const listening = state.kind === "listening" && voice.status !== "idle";

  return (
    <View style={{ gap: 14 }}>
      {"heard" in state && state.heard ? (
        <View style={styles.heard}>
          <T size={15} color={colors.onBrand}>
            {state.heard}
          </T>
        </View>
      ) : null}
      {state.kind === "listening" && (
        <View style={styles.center}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listening ? "음성 입력 멈추기" : "다시 말하기"}
            onPress={listening ? voice.stop : listen}
            style={[
              styles.mic,
              { backgroundColor: listening ? colors.danger : colors.brand },
            ]}
          >
            <Ionicons
              name={listening ? "stop" : "mic"}
              size={34}
              color={colors.onBrand}
            />
          </Pressable>
        </View>
      )}
      {(state.kind === "thinking" || state.kind === "saving") && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <T size={13} color={colors.textMuted}>
            {state.kind === "thinking"
              ? "예상 금액을 계산하고 있어요"
              : "등록하고 있어요"}
          </T>
        </View>
      )}
      {(state.kind === "card" || state.kind === "saving") && (
        <ScheduleCard
          key={`${state.schedule.date}-${state.schedule.categoryId}-${state.schedule.amount}`}
          title={state.schedule.title}
          categoryName={state.schedule.category}
          initial={{
            date: state.schedule.date,
            amount: state.schedule.amount ?? null,
            categoryId: state.schedule.categoryId,
          }}
          disabled={state.kind === "saving"}
          onSubmit={(v) => void register(state.schedule, v)}
        />
      )}
      {state.kind === "message" && (
        <>
          <T size={14} color={colors.textSub} style={{ lineHeight: 21 }}>
            {state.text}
          </T>
          <Button label="다시 말하기" icon="mic" onPress={listen} />
        </>
      )}
    </View>
  );
}

function failText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "CHAT_UNAVAILABLE")
      return "지금은 음성 입력으로 예정 지출을 등록할 수 없어요. 예정 지출 화면에서 직접 등록해 주세요";
    if (e.code === "TOO_MANY_ATTEMPTS")
      return "요청이 많아서 잠시 쉬어야 해요. 조금 뒤에 다시 말해 주세요";
    return e.message;
  }
  return "연결이 원활하지 않아요. 잠시 뒤 다시 말해 주세요";
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 10, paddingVertical: 8 },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  heard: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: colors.brand,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
