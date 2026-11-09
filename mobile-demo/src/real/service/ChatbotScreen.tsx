/**
 * AI 메이트(챗봇). 스타일 선택 → 메뉴 → 대화 3단계.
 * 답변은 POST /chat/messages(Gemini), 카드 숫자는 서버 계산값(/budget/today, /analysis/summary)만 보여 준다.
 * 요일별 배분은 답변의 action을 사용자가 [확인]으로 누른 뒤에만 PUT /budget/day-weights로 저장한다.
 * 일정("금요일에 친구랑 저녁")은 서버가 거래 기록으로 예측한 금액을 한 줄 카드(날짜 · 금액 · 카테고리)로 보여 주고
 * [반영]·[수정]을 누른 뒤에만 POST /scheduled-expenses로 저장한다. 하루 예산은 GET /budget/today의 서버 값을 그대로 보여 준다.
 * AI 음성 답변을 켜 두면 예정 지출 확인 질문 한 줄만 기기 음성 합성으로 읽는다.
 */
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Keyboard, Platform, ScrollView, View } from "react-native";
import { goBack } from "@/real/components/SubHeader";
import { ConfirmModal, T } from "@/real/components/ui";
import { colors } from "@/real/theme";
import { won } from "@/real/utils/format";
import { api, sessionGeneration } from "./api/client";
import { useServerExtensions } from "./serverExtensions";
import { useSession } from "./Session";
import { readStorage, writeStorage } from "./storage";
import { type ScheduleSubmit } from "./ScheduleCard";
import { confirmSpeech } from "./scheduleDraft";
import { speak, stopSpeaking, useVoiceReply } from "./voiceReply";
import type { ChatRequest, ChatResponse, Today } from "./types";
import { Loading, Page } from "./ui";
import { KeyboardFrame, Composer } from "./chatbot/Composer";
import {
  ListeningBubble,
  TypingBubble,
  MyBubble,
  BotGroup,
} from "./chatbot/bubbles";
import {
  mateImg,
  MATE_KEY,
  whenText,
  type MateId,
  type Proposal,
  type Schedule,
  type CardKind,
  type Choice,
  type Msg,
  type Step,
  mates,
  type TopicId,
  topics,
  topicIntro,
  errorText,
  ro,
  groupBot,
} from "./chatbot/model";
import {
  type Speaker,
  RoomHeader,
  EnterView,
  MateSelect,
  Menu,
  SoonModal,
} from "./chatbot/parts";
import { styles } from "./chatbot/styles";

export function ChatbotScreen() {
  const extensions = useServerExtensions();
  if (!extensions.available)
    return (
      <Page title="AI 메이트">
        {extensions.checking ? (
          <Loading />
        ) : (
          <T>
            AI 메이트를 준비 중이에요. 현재는 기록한 지출과 소비 분석을 확인해
            주세요
          </T>
        )}
      </Page>
    );
  return <ChatbotRoom />;
}

function ChatbotRoom() {
  const params = useLocalSearchParams<{ question?: string }>();
  const session = useSession();
  const [step, setStep] = useState<Step>("loading");
  const [mate, setMate] = useState<MateId>("ANALYST");
  // 톱니로 스타일 선택을 열었으면 돌아갈 화면(메뉴·대화), 처음 선택이면 null
  const [settingsFrom, setSettingsFrom] = useState<"menu" | "chat" | null>(
    null,
  );
  const [thanks, setThanks] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [soon, setSoon] = useState(false);
  const voiceReply = useVoiceReply();
  const speakOn = useRef(false);
  useEffect(() => {
    speakOn.current = voiceReply.on;
  }, [voiceReply.on]);
  const nextId = useRef(1);
  const list = useRef<Msg[]>([]);
  const lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  // 직전에 제안받은 일정. 사용자가 금액·날짜를 고치자고 하면 서버에 함께 보낸다.
  const proposal = useRef<Schedule | null>(null);
  // 화면을 떠나거나 메뉴로 돌아가면 올라가서, 늦게 온 답을 버린다.
  const focus = useRef(0);

  const update = (fn: (m: Msg[]) => Msg[]) => {
    list.current = fn(list.current);
    setMsgs(list.current);
  };
  const push = (...items: Omit<Msg, "id">[]) =>
    update((m) => [
      ...m,
      ...items.map((x) => ({ ...x, id: nextId.current++ })),
    ]);

  const cancel = () => {
    ++focus.current;
    pending.current?.abort();
    lock.current = false;
    setBusy(false);
  };

  useFocusEffect(
    useCallback(() => {
      ++focus.current;
      lock.current = false;
      setBusy(false);
      return () => {
        ++focus.current;
        pending.current?.abort();
        lock.current = false;
      };
    }, []),
  );

  // 한 번 고른 스타일은 저장해 두고 다음부터는 메뉴부터 보여 준다.
  useEffect(() => {
    let alive = true;
    readStorage(MATE_KEY)
      .then((v) => {
        if (!alive) return;
        const saved = mates.find((m) => m.id === v?.toUpperCase());
        if (saved) {
          setMate(saved.id);
          setStep("menu");
        } else setStep("select");
      })
      .catch(() => alive && setStep("select"));
    return () => {
      alive = false;
    };
  }, []);

  const mateName = mates.find((m) => m.id === mate)!.name;

  /** 지금까지의 대화(안내 말풍선 제외, 최근 20개)를 보내고 답을 붙인다. */
  const request = async (card?: CardKind) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const started = focus.current;
    const generation = sessionGeneration();
    const controller = new AbortController();
    pending.current = controller;
    const stale = () =>
      started !== focus.current || generation !== sessionGeneration();
    const body: ChatRequest = {
      mate,
      accepts: ["SCHEDULE"],
      pending: proposal.current
        ? {
            title: proposal.current.title,
            date: proposal.current.date,
            categoryId: proposal.current.categoryId,
            amount: proposal.current.amount,
          }
        : undefined,
      messages: list.current
        .filter((m) => !m.ui)
        .slice(-20)
        .map((m) => ({
          role: m.from === "me" ? "USER" : "MODEL",
          text: m.text.slice(0, 1000),
        })),
    };
    try {
      const result = await api<ChatResponse>("/chat/messages", {
        method: "POST",
        body,
        timeoutMs: 40000,
        signal: controller.signal,
      });
      if (stale()) return;
      const schedule =
        result.action?.type === "SCHEDULE" ? result.action.schedule : undefined;
      if (result.action) proposal.current = schedule ?? null;
      push({
        from: "bot",
        text: result.reply,
        card,
        schedule,
        choices:
          result.action && !schedule
            ? confirmChoices(result.action)
            : undefined,
      });
      if (schedule && speakOn.current) speak(confirmSpeech(schedule));
    } catch (e) {
      if (stale()) return;
      push({
        from: "bot",
        ui: true,
        text: errorText(e),
        choices: [{ label: "다시 시도", run: () => void request(card) }],
      });
    } finally {
      if (!stale()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };

  const ask = (text: string, card?: CardKind) => {
    const t = text.trim().slice(0, 1000);
    if (lock.current || !t) return;
    push({ from: "me", text: t });
    void request(card);
  };

  /** 사용자가 카드의 [반영]·[수정]을 누른 뒤에만 예정 지출로 저장한다. 하루 예산은 서버가 다시 계산한 값을 보여 준다. */
  const register = async (msgId: number, title: string, s: ScheduleSubmit) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    stopSpeaking();
    update((m) => m.map((x) => (x.id === msgId ? { ...x, used: true } : x)));
    push({ from: "me", text: s.edited ? "수정" : "반영" });
    const started = focus.current;
    const generation = sessionGeneration();
    const stale = () =>
      started !== focus.current || generation !== sessionGeneration();
    try {
      await api("/scheduled-expenses", {
        method: "POST",
        body: {
          amount: s.amount,
          categoryId: s.categoryId,
          title,
          date: s.date,
        },
      });
      if (stale()) return;
      proposal.current = null;
      session.invalidate();
      const head = `${whenText(s.date)} **${title}** ${won(s.amount)}원을 예정 지출로 등록했어요.`;
      let text = head;
      try {
        const t = await api<Today>("/budget/today");
        const plan = t.dayPlans.find((p) => p.date === s.date);
        text = plan
          ? `${head}\n그날 하루 예산은 **${won(plan.budget)}원**, 오늘 하루 예산은 ${won(t.dailyBudget)}원이에요.`
          : `${head}\n다음 수입일 이후 날짜라 지금 예산에는 아직 반영되지 않아요.`;
      } catch {
        // 등록은 끝났으니 예산 숫자만 생략한다
      }
      if (stale()) return;
      push({ from: "bot", text, card: "budget" });
    } catch (e) {
      if (stale()) return;
      push({
        from: "bot",
        ui: true,
        text: errorText(e),
        choices: [
          { label: "다시 시도", run: () => void register(msgId, title, s) },
        ],
      });
    } finally {
      if (!stale()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };

  const confirmChoices = (action: Proposal): Choice[] =>
    action.type === "SCHEDULE"
      ? []
      : [
          { label: "확인", run: () => void apply(action) },
          {
            label: "그대로 둘게",
            run: () =>
              push(
                { from: "me", text: "그대로 둘게" },
                { from: "bot", text: "알겠어요. 지금 배분을 그대로 둘게요." },
              ),
          },
        ];

  /** 사용자가 [확인]을 누른 뒤에만 저장한다. 금액은 서버가 다시 계산한다. */
  const apply = async (action: Proposal) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    push({ from: "me", text: "확인" });
    const started = focus.current;
    const generation = sessionGeneration();
    const stale = () =>
      started !== focus.current || generation !== sessionGeneration();
    try {
      await api("/budget/day-weights", {
        method: "PUT",
        body: { preset: action.preset },
      });
      if (stale()) return;
      session.invalidate();
      push({
        from: "bot",
        text: `요일별 배분을 **${action.label ?? ""}**${ro(action.label ?? "")} 바꿨어요.
오늘 하루 예산부터 반영돼요.`,
        card: "budget",
      });
    } catch (e) {
      if (stale()) return;
      push({
        from: "bot",
        ui: true,
        text: errorText(e),
        choices: [{ label: "다시 시도", run: () => void apply(action) }],
      });
    } finally {
      if (!stale()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };

  const startChat = (first: { topic: TopicId } | { text: string }) => {
    if ("topic" in first && topics.find((t) => t.id === first.topic)?.soon) {
      setSoon(true);
      return;
    }
    cancel();
    proposal.current = null;
    update(() => []);
    push(
      {
        from: "bot",
        ui: true,
        text: thanks
          ? `선택해주셔서 고마워요!\n**${mateName}** 모드로\n지금부터 함께할게요.`
          : `**${mateName}** 모드로 함께할게요.`,
      },
      {
        from: "bot",
        ui: true,
        text: "어떤 걸 먼저 확인해볼까요?\n위의 메뉴를 선택하거나\n궁금한 걸 자유롭게 물어보세요!",
      },
    );
    setThanks(false);
    setStep("chat");
    if ("text" in first) return ask(first.text);
    const topic = first.topic;
    const intro = topicIntro[topic];
    push(
      { from: "me", ui: true, text: topics.find((t) => t.id === topic)!.title },
      {
        from: "bot",
        ui: true,
        text: intro.text,
        choices: intro.quick.map((q) => ({
          label: q.label,
          run: () => ask(q.label, q.card),
        })),
      },
    );
  };

  const act = (msgId: number, c: Choice) => {
    if (lock.current) return;
    update((m) => m.map((x) => (x.id === msgId ? { ...x, used: true } : x)));
    c.run();
  };

  const chooseMate = (m: MateId) => {
    setMate(m);
    writeStorage(MATE_KEY, m).catch(() => {});
    if (settingsFrom === "chat") {
      setSettingsFrom(null);
      setStep("chat");
      push({
        from: "bot",
        ui: true,
        text: `**${mates.find((x) => x.id === m)!.name}** 모드로 바꿨어요.`,
      });
    } else if (settingsFrom === "menu") {
      setSettingsFrom(null);
      setStep("menu");
    } else {
      setThanks(true);
      setStep("menu");
    }
  };

  const soonModal = (
    <>
      <SoonModal visible={soon} onClose={() => setSoon(false)} />
      {/* 처음 들어오면 한 번 묻는다(스타일 선택을 마친 뒤). 나중엔 대화 화면 스피커 버튼으로 바꾼다 */}
      <ConfirmModal
        visible={voiceReply.needsChoice && step !== "select" && !soon}
        title="AI 음성 답변을 쓸까요?"
        message={
          "예정 지출을 등록할지 물을 때 휴대폰 음성으로 읽어 드려요. " +
          "읽는 글자는 기기 안에서 소리로 바꾸고 서버로 보내지 않아요. 대화 화면 위 스피커 버튼으로 언제든 바꿀 수 있어요."
        }
        confirmLabel="쓸게요"
        cancelLabel="안 쓸게요"
        onConfirm={() => voiceReply.set(true)}
        onCancel={() => voiceReply.set(false)}
      />
    </>
  );

  if (step === "loading") return <View style={styles.root} />;
  if (step === "select")
    return (
      <MateSelect
        initial={mate}
        onDone={chooseMate}
        // 톱니에서 들어왔으면 연 화면(메뉴·대화)으로, 처음이면 챗봇을 나간다.
        onBack={() => {
          if (!settingsFrom) return goBack("/home");
          setStep(settingsFrom);
          setSettingsFrom(null);
        }}
      />
    );
  if (step === "menu")
    return (
      <>
        <Menu
          mate={mate}
          initial={params.question?.slice(0, 1000)}
          onBack={() => goBack("/home")}
          onSettings={() => {
            setSettingsFrom("menu");
            setStep("select");
          }}
          onTopic={(t) => startChat({ topic: t })}
          onSend={(text) => startChat({ text })}
        />
        {soonModal}
      </>
    );
  return (
    <>
      <Chat
        mate={mate}
        msgs={msgs}
        busy={busy}
        onBack={() => {
          cancel();
          setStep("menu");
        }}
        onSettings={() => {
          setSettingsFrom("chat");
          setStep("select");
        }}
        onAction={act}
        onSchedule={(msgId, title, value) => void register(msgId, title, value)}
        onSend={(text) => ask(text)}
        speaker={
          voiceReply.available
            ? {
                on: voiceReply.on,
                toggle: () => voiceReply.set(!voiceReply.on),
              }
            : undefined
        }
      />
      {soonModal}
    </>
  );
}

/** 3단계: 대화. 헤더 톱니로 스타일을 바꾼다. */
function Chat({
  mate,
  msgs,
  busy,
  onBack,
  onSettings,
  onAction,
  onSchedule,
  onSend,
  speaker,
}: {
  mate: MateId;
  msgs: Msg[];
  busy: boolean;
  onBack: () => void;
  onSettings: () => void;
  onAction: (msgId: number, c: Choice) => void;
  onSchedule: (msgId: number, title: string, value: ScheduleSubmit) => void;
  onSend: (text: string) => void;
  speaker?: Speaker;
}) {
  const scroll = useRef<ScrollView>(null);
  // 음성 입력으로 듣는 동안 사용자 쪽에 "…" 말풍선을 띄운다
  const [listening, setListening] = useState(false);
  const m = mates.find((x) => x.id === mate)!;
  // 키보드가 올라오면 가장 최근 대화가 키보드 바로 위에 보이게 맨 아래로 내린다.
  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () =>
        setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50),
    );
    return () => sub.remove();
  }, []);
  return (
    <KeyboardFrame>
      <RoomHeader onBack={onBack} onSettings={onSettings} speaker={speaker} />
      <EnterView style={{ backgroundColor: "#F6F8FC" }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 메뉴의 캐릭터·스타일 이름을 작게 이어 받아 같은 대화방처럼 보이게 한다 */}
          <View style={styles.chatIntro}>
            <Image
              source={mateImg}
              style={styles.chatIntroImg}
              accessibilityLabel="AI 메이트 캐릭터"
            />
            <View style={[styles.modeBadge, { alignSelf: "center" }]}>
              <T size={12} weight="700" color={colors.brand}>
                {m.emoji} {m.name}
              </T>
            </View>
          </View>
          {groupBot(msgs).map((g) =>
            g.from === "me" ? (
              <MyBubble key={g.items[0].id} text={g.items[0].text} />
            ) : (
              <BotGroup
                key={g.items[0].id}
                items={g.items}
                disabled={busy}
                onAction={onAction}
                onSchedule={onSchedule}
              />
            ),
          )}
          {listening && <ListeningBubble />}
          {busy && (
            <View style={styles.botRow}>
              <View style={styles.avatarSlot} />
              <TypingBubble />
            </View>
          )}
        </ScrollView>
      </EnterView>
      <Composer busy={busy} onSend={onSend} onListening={setListening} />
    </KeyboardFrame>
  );
}
