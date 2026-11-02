/**
 * AI 메이트(챗봇). 스타일 선택 → 메뉴 → 대화 3단계.
 * 답변은 POST /chat/messages(Gemini), 카드 숫자는 서버 계산값(/budget/today, /analysis/summary)만 보여 준다.
 * 요일별 배분은 답변의 action을 사용자가 [확인]으로 누른 뒤에만 PUT /budget/day-weights로 저장한다.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  type ViewStyle,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { Donut } from "@/real/components/Donut";
import { goBack } from "@/real/components/SubHeader";
import { Button, T } from "@/real/components/ui";
import {
  colors,
  elevation1,
  floating,
  noOutline,
  pressTransition,
  radius,
  space,
  type,
} from "@/real/theme";
import { won } from "@/real/utils/format";
import { api, ApiError, sessionGeneration } from "./api/client";
import { useServerExtensions } from "./serverExtensions";
import { useSession } from "./Session";
import { readStorage, writeStorage } from "./storage";
import type { Analysis, ChatRequest, ChatResponse, Today } from "./types";
import { CategoryIcon, Loading, Page, seoulDate, useResource } from "./ui";

const mateImg = require("../../../assets/real/chatbot/mate.png");
const MATE_KEY = "chatbot.mate";
const COMPOSER_HINT = "궁금한 내용을 입력해보세요...";

type IconName = ComponentProps<typeof Ionicons>["name"];
type MateId = NonNullable<ChatRequest["mate"]>;
type Proposal = NonNullable<ChatResponse["action"]>;
type CardKind = "budget" | "top" | "compare";
type Choice = { label: string; run: () => void };
/** ui: 화면 안내용 말풍선(인사·메뉴 안내·오류). 모델에 보내는 대화에서 뺀다. */
type Msg = {
  id: number;
  from: "bot" | "me";
  text: string;
  card?: CardKind;
  choices?: Choice[];
  used?: boolean;
  ui?: boolean;
};
type Step = "loading" | "select" | "menu" | "chat";

/** AI 메이트 스타일. 처음 한 번 고르고, 이후엔 설정(톱니)에서만 바꾼다. */
const mates: {
  id: MateId;
  name: string;
  desc: string;
  emoji: string;
  tint: string;
}[] = [
  {
    id: "ANALYST",
    name: "똑똑한 분석가",
    desc: "데이터로 꼼꼼하게 분석해주는 타입",
    emoji: "💡",
    tint: "#EEF3FF",
  },
  {
    id: "FRIEND",
    name: "다정한 친구",
    desc: "부드럽고 친절하게 알려주는 타입",
    emoji: "😊",
    tint: "#F3F0FF",
  },
  {
    id: "COACH",
    name: "따끔한 조언가",
    desc: "솔직하고 직설적으로 말해주는 타입",
    emoji: "🔥",
    tint: "#FFF2EA",
  },
];

type TopicId = "plan" | "budget" | "spend" | "free";

/** soon: 아직 서버 기능이 없어 누르면 '업데이트 예정' 안내만 띄운다. */
const topics: {
  id: TopicId;
  title: string;
  desc: string;
  icon: IconName;
  soon?: boolean;
}[] = [
  {
    id: "plan",
    title: "약속 설정",
    desc: "지출·저축 관련\n일정을 관리해요",
    icon: "calendar",
    soon: true,
  },
  {
    id: "budget",
    title: "예산 변경",
    desc: "요일별 하루 예산을\n내게 맞게 바꿔요",
    icon: "wallet",
  },
  {
    id: "spend",
    title: "지출 흐름",
    desc: "지출증감, 과소비신호,\n추천 등을 알려줘요",
    icon: "stats-chart",
  },
  {
    id: "free",
    title: "기타",
    desc: "궁금한 점을\n자유롭게 물어보세요",
    icon: "chatbubble-ellipses",
  },
];

/** 메뉴를 고르면 화면이 먼저 하는 말과 바로 누를 수 있는 질문. 질문은 그대로 AI 메이트에게 보낸다. */
const topicIntro: Record<
  Exclude<TopicId, "plan">,
  { text: string; quick: { label: string; card?: CardKind }[] }
> = {
  spend: {
    text: "입력한 기록으로 어떤 걸 볼까요?",
    quick: [
      { label: "어디에 제일 많이 썼어?", card: "top" },
      { label: "지난 기간이랑 비교해줘", card: "compare" },
      { label: "아끼는 방법 알려줘" },
    ],
  },
  budget: {
    text: "하루 예산을 어떻게 바꾸고 싶으세요? 남은 생활비를 요일별로 어떻게 나눌지 정할 수 있어요.",
    quick: [
      { label: "주말에 좀 더 쓰고 싶어" },
      { label: "평일에 좀 더 쓰고 싶어" },
      { label: "매일 똑같이 나눠 줘" },
    ],
  },
  free: {
    text: "궁금한 걸 자유롭게 물어보세요!",
    quick: [{ label: "오늘 얼마 쓸 수 있어?", card: "budget" }],
  },
};

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
  const nextId = useRef(1);
  const list = useRef<Msg[]>([]);
  const lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  // 화면을 떠나거나 메뉴로 돌아가면 올라가서, 늦게 온 답을 버린다.
  const focus = useRef(0);

  const update = (fn: (m: Msg[]) => Msg[]) => {
    list.current = fn(list.current);
    setMsgs(list.current);
  };
  const push = (...items: Omit<Msg, "id">[]) =>
    update((m) => [...m, ...items.map((x) => ({ ...x, id: nextId.current++ }))]);

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
      push({
        from: "bot",
        text: result.reply,
        card,
        choices: result.action ? confirmChoices(result.action) : undefined,
      });
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

  const confirmChoices = (action: Proposal): Choice[] => [
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
        text: `요일별 배분을 **${action.label}**${ro(action.label)} 바꿨어요.\n오늘 하루 예산부터 반영돼요.`,
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
    const topic = first.topic as Exclude<TopicId, "plan">;
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

  const soonModal = <SoonModal visible={soon} onClose={() => setSoon(false)} />;

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
        onSend={(text) => ask(text)}
      />
      {soonModal}
    </>
  );
}

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "CHAT_UNAVAILABLE")
      return "AI 메이트를 준비 중이에요. 연결 설정이 끝나면 답변을 받을 수 있어요.";
    if (e.code === "TOO_MANY_ATTEMPTS")
      return "질문이 많아서 잠시 쉬어야 해요. 조금 뒤에 다시 물어봐 주세요.";
    return e.message;
  }
  return "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";
}

/** 받침에 맞춘 조사("기본 배분" → "으로", "주말 넉넉히" → "로"). ㄹ 받침도 '로'. */
function ro(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/** 'YYYY-MM-DD'에 날짜 더하기(UTC 기준이라 시간대와 무관). */
function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 서버가 AI 메이트에 보내는 기간과 같다: 이번 기간은 수입 주기 시작(예산이 없으면 이번 달 1일)부터 오늘까지,
 * 직전 기간은 그 바로 앞 같은 일수.
 */
function usePeriods() {
  const today = useResource<Today>("/budget/today");
  if (today.loading && !today.data) return null;
  const to = today.data?.date ?? seoulDate();
  let from = today.data?.cycleStart ?? to.slice(0, 8) + "01";
  if (from > to) from = to;
  const days =
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000 +
    1;
  return {
    current: { from, to },
    previous: { from: addDays(from, -days), to: addDays(from, -1) },
  };
}

function useSummary(range: { from: string; to: string } | undefined) {
  return useResource<Analysis>(
    range ? `/analysis/summary?from=${range.from}&to=${range.to}` : null,
  );
}

const shortDate = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

/** 캐릭터 뒤의 옅은 파란 빛. */
function Hero({ dots }: { dots?: boolean }) {
  return (
    <View style={styles.hero}>
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="55%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#CFE0FF" stopOpacity="0.95" />
            <Stop offset="0.6" stopColor="#E4EDFF" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="150" cy="110" rx="150" ry="95" fill="url(#glow)" />
      </Svg>
      <Image
        source={mateImg}
        style={styles.heroImg}
        accessibilityLabel="AI 메이트 캐릭터"
      />
      {dots && (
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      )}
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      onPress={onPress}
      hitSlop={10}
      style={styles.backBtn}
    >
      <Ionicons name="chevron-back" size={24} color={colors.text} />
    </Pressable>
  );
}

/** 선택·메뉴·대화 공통 헤더. 세 화면이 같은 헤더를 써서 가운데만 바뀌는 한 대화방처럼 보인다. 설정 버튼이 없으면 자리만 둬 제목을 가운데에 맞춘다. */
function RoomHeader({
  onBack,
  onSettings,
}: {
  onBack: () => void;
  onSettings?: () => void;
}) {
  return (
    <View style={styles.roomHeader}>
      <BackButton onPress={onBack} />
      <T size={17} weight="800" style={[styles.center, { flex: 1 }]}>
        AI 메이트
      </T>
      {onSettings ? (
        <SettingsButton onPress={onSettings} />
      ) : (
        <View style={styles.backBtn} />
      )}
    </View>
  );
}

/** 선택·메뉴·대화의 가운데 내용이 바뀔 때 살짝 올라오며 나타나게 한다. */
function EnterView({
  style,
  children,
}: {
  style?: ViewStyle;
  children: ReactNode;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 260,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [v]);
  const translateY = v.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  return (
    <Animated.View
      style={[{ flex: 1, opacity: v, transform: [{ translateY }] }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** 메이트 스타일 선택을 연다(메뉴·대화 화면 오른쪽 위). */
function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="메이트 스타일 바꾸기"
      onPress={onPress}
      hitSlop={10}
      style={styles.backBtn}
    >
      <Ionicons name="settings-outline" size={24} color={colors.text} />
    </Pressable>
  );
}

/** 1단계: 처음 한 번만 보이는 스타일 선택. 이후엔 메뉴·대화 화면 톱니에서 들어온다. */
function MateSelect({
  initial,
  onDone,
  onBack,
}: {
  initial: MateId;
  onDone: (m: MateId) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState(initial);
  return (
    <View style={styles.root}>
      <RoomHeader onBack={onBack} />
      <EnterView>
        <ScrollView
          contentContainerStyle={styles.selectContent}
          showsVerticalScrollIndicator={false}
        >
          <Hero />
          <View style={{ alignItems: "center", gap: space[2] }}>
            <T size={22} weight="800" style={styles.center}>
              안녕하세요!{"\n"}내 금융 메이트예요{" "}
              <T size={22} color={colors.brand}>
                💙
              </T>
            </T>
            <T size={type.meta} color={colors.textMuted} style={styles.center}>
              지금부터 어떤 스타일로{"\n"}도와드릴까요?
            </T>
          </View>
          <View style={{ gap: space[3] }}>
            <T size={type.body} weight="800">
              AI 메이트 스타일 선택하기
            </T>
            <View style={{ gap: 10 }} accessibilityRole="radiogroup">
              {mates.map((m) => {
                const on = m.id === sel;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="radio"
                    accessibilityLabel={m.name}
                    accessibilityState={{ selected: on }}
                    onPress={() => setSel(m.id)}
                    style={({ pressed }) => [
                      styles.mateRow,
                      {
                        backgroundColor: m.tint,
                        borderColor: on ? colors.brand : "transparent",
                      },
                      pressTransition,
                      pressed && { transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <T size={26}>{m.emoji}</T>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={15} weight="800">
                        {m.name}
                      </T>
                      <T size={12} color={colors.textMuted}>
                        {m.desc}
                      </T>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={on ? colors.brand : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDone(sel)}
            style={({ pressed }) => [
              styles.cta,
              pressTransition,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            {/* 웹은 크기를 안 주면 기본 300px 폭으로 그려 버튼 절반만 칠한다 */}
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="cta" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#3D7BFF" />
                  <Stop offset="1" stopColor="#0046FF" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#cta)" />
            </Svg>
            <T size={type.body} weight="800" color={colors.onBrand}>
              선택하고 시작하기
            </T>
          </Pressable>
        </View>
      </EnterView>
    </View>
  );
}

/** 2단계: 무엇을 도와드릴까요? 메뉴 4개 + 자유 질문 입력. */
function Menu({
  mate,
  initial,
  onBack,
  onSettings,
  onTopic,
  onSend,
}: {
  mate: MateId;
  initial?: string;
  onBack: () => void;
  onSettings: () => void;
  onTopic: (t: TopicId) => void;
  onSend: (text: string) => void;
}) {
  const m = mates.find((x) => x.id === mate)!;
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <RoomHeader onBack={onBack} onSettings={onSettings} />
      <EnterView>
        <ScrollView
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 가운데 정렬로 감싸면 Hero가 이미지 폭으로 줄어 배경 빛이 잘린다 */}
          <View style={{ gap: space[2] }}>
            <Hero dots />
            <View style={[styles.modeBadge, { alignSelf: "center" }]}>
              <T size={12} weight="700" color={colors.brand}>
                {m.emoji} {m.name}
              </T>
            </View>
          </View>
          <View style={{ alignItems: "center", gap: space[2] }}>
            <T size={20} weight="800">
              무엇을 도와드릴까요?
            </T>
            <T size={type.meta} color={colors.textMuted} style={styles.center}>
              원하는 메뉴를 선택하거나{"\n"}자유롭게 질문해보세요!
            </T>
          </View>
          <View style={styles.grid}>
            {topics.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={t.title}
                onPress={() => onTopic(t.id)}
                style={({ pressed }) => [
                  styles.topic,
                  pressTransition,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={styles.topicIcon}>
                  <Ionicons name={t.icon} size={22} color={colors.brand} />
                </View>
                <T size={type.meta} weight="800" style={styles.center}>
                  {t.title}
                </T>
                <T
                  size={12}
                  color={colors.textMuted}
                  style={[styles.center, { lineHeight: 17 }]}
                >
                  {t.desc}
                </T>
              </Pressable>
            ))}
          </View>
          <T size={12} color={colors.textMuted} style={styles.center}>
            입력한 잔액·기록 기준으로 답해요. 질문하면 예산 요약·카테고리별 지출
            합계와 이 대화를 Google Gemini에 보내요. 거래 제목·메모·개별 거래는
            보내지 않고, 대화는 저장하지 않아요.
          </T>
        </ScrollView>
      </EnterView>
      <Composer initial={initial} onSend={onSend} />
    </KeyboardAvoidingView>
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
  onSend,
}: {
  mate: MateId;
  msgs: Msg[];
  busy: boolean;
  onBack: () => void;
  onSettings: () => void;
  onAction: (msgId: number, c: Choice) => void;
  onSend: (text: string) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const m = mates.find((x) => x.id === mate)!;
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <RoomHeader onBack={onBack} onSettings={onSettings} />
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
              />
            ),
          )}
          {busy && (
            <View style={styles.botRow}>
              <View style={styles.avatarSlot} />
              <TypingBubble />
            </View>
          )}
        </ScrollView>
      </EnterView>
      <Composer busy={busy} onSend={onSend} />
    </KeyboardAvoidingView>
  );
}

/** 이어진 봇 말풍선은 아바타 하나로 묶는다. */
function groupBot(msgs: Msg[]) {
  const out: { from: Msg["from"]; items: Msg[] }[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (m.from === "bot" && last?.from === "bot") last.items.push(m);
    else out.push({ from: m.from, items: [m] });
  }
  return out;
}

function Composer({
  initial,
  busy,
  onSend,
}: {
  initial?: string;
  busy?: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial ?? "");
  const ready = !!draft.trim() && !busy;
  const send = () => {
    if (!ready) return;
    onSend(draft.trim());
    setDraft("");
  };
  return (
    <View style={styles.composer}>
      <TextInput
        accessibilityLabel="AI 메이트에게 질문"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={send}
        placeholder={COMPOSER_HINT}
        placeholderTextColor={colors.placeholder}
        maxLength={1000}
        style={[styles.input, noOutline]}
        returnKeyType="send"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="보내기"
        accessibilityState={{ disabled: !ready }}
        onPress={send}
        disabled={!ready}
        style={[
          styles.send,
          { backgroundColor: ready ? colors.brand : "#A9C3FF" },
        ]}
      >
        <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

function TypingBubble() {
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 500,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View
      style={styles.typing}
      accessibilityLabel="AI 메이트가 답변을 준비하고 있어요"
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={[styles.typingBar, { opacity: pulse }]} />
    </View>
  );
}

/** **굵게**를 지원하는 말풍선 글자. 모델이 붙이는 목록 기호(*, -)·제목 기호(#)는 정리한다. */
function Rich({ text, color }: { text: string; color?: string }) {
  const clean = text.replace(/^\s*[*-]\s+/gm, "• ").replace(/^#+\s*/gm, "");
  return (
    <T size={15} color={color} selectable style={{ lineHeight: 22 }}>
      {clean.split("**").map((part, i) =>
        i % 2 ? (
          <T key={i} size={15} weight="800" color={color}>
            {part}
          </T>
        ) : (
          part
        ),
      )}
    </T>
  );
}

function MyBubble({ text }: { text: string }) {
  return (
    <View style={[styles.bubble, styles.mine]}>
      <Rich text={text} color={colors.onBrand} />
    </View>
  );
}

function BotGroup({
  items,
  disabled,
  onAction,
}: {
  items: Msg[];
  disabled: boolean;
  onAction: (msgId: number, c: Choice) => void;
}) {
  return (
    <View style={styles.botRow}>
      <View style={styles.avatar}>
        <Image source={mateImg} style={styles.avatarImg} />
      </View>
      <View style={{ flex: 1, gap: space[2] }}>
        {items.map((msg) => (
          <View key={msg.id} style={{ gap: space[2] }}>
            <View style={[styles.bubble, styles.bot]}>
              <Rich text={msg.text} />
            </View>
            {msg.card === "budget" && <BudgetCard />}
            {msg.card === "top" && <TopCard />}
            {msg.card === "compare" && <CompareCard />}
            {msg.choices && !msg.used && (
              <View style={styles.actions}>
                {msg.choices.map((c, i) => (
                  <Pressable
                    key={c.label}
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => onAction(msg.id, c)}
                    style={({ pressed }) => [
                      styles.action,
                      i === 0 && styles.actionMain,
                      disabled && { opacity: 0.5 },
                      pressTransition,
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <T
                      size={type.meta}
                      weight="700"
                      color={i === 0 ? colors.onBrand : colors.brand}
                    >
                      {c.label}
                    </T>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** 카드 데이터를 불러오는 동안·실패했을 때 같은 자리를 쓴다. */
function CardNote({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <T size={type.caption} color={colors.textMuted}>
        {text}
      </T>
    </View>
  );
}

function BudgetCard() {
  const r = useResource<Today>("/budget/today");
  if (r.loading && !r.data)
    return <CardNote text="오늘 예산을 불러오고 있어요" />;
  if (!r.data)
    return (
      <CardNote
        text={
          r.error instanceof ApiError && r.error.code === "BUDGET_NOT_SET"
            ? "예산을 설정하면 오늘 쓸 수 있는 돈을 보여 드려요"
            : "오늘 예산을 불러오지 못했어요"
        }
      />
    );
  const b = r.data;
  const usedRatio =
    b.dailyBudget > 0
      ? Math.min(1, Math.max(0, b.todaySpent / b.dailyBudget))
      : 1;
  const over = b.todayAvailable < 0;
  return (
    <View style={styles.card}>
      <T size={type.caption} color={colors.textMuted}>
        {over ? "오늘 예산을 넘었어요" : "오늘 쓸 수 있는 돈"}
      </T>
      <T size={30} weight="800" color={over ? colors.danger : colors.brand} num>
        {won(b.todayAvailable)}원
      </T>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${usedRatio * 100}%`,
              backgroundColor: over ? colors.danger : colors.brand,
            },
          ]}
        />
      </View>
      <View style={styles.between}>
        <Stat label="남은 생활비" value={`${won(b.remaining)}원`} />
        <Stat label="다음 수입일까지" value={`${b.daysLeft}일`} alignEnd />
      </View>
      <T size={type.caption} color={colors.textMuted}>
        입력한 잔액·기록 기준 추정이에요
      </T>
    </View>
  );
}

function Stat({
  label,
  value,
  alignEnd,
}: {
  label: string;
  value: string;
  alignEnd?: boolean;
}) {
  return (
    <View style={{ alignItems: alignEnd ? "flex-end" : "flex-start", gap: 2 }}>
      <T size={type.caption} color={colors.textMuted}>
        {label}
      </T>
      <T size={type.body} weight="700" num>
        {value}
      </T>
    </View>
  );
}

function TopCard() {
  const periods = usePeriods();
  const r = useSummary(periods?.current);
  if (!periods || (r.loading && !r.data))
    return <CardNote text="지출 기록을 불러오고 있어요" />;
  if (!r.data) return <CardNote text="지출 기록을 불러오지 못했어요" />;
  const s = r.data;
  if (s.expenseTotal <= 0)
    return <CardNote text="이번 기간에 기록한 지출이 아직 없어요" />;
  return (
    <View style={styles.card}>
      <View style={{ alignItems: "center" }}>
        <Donut
          size={150}
          stroke={18}
          total={s.expenseTotal}
          segments={s.byCategory.map((c) => ({
            value: c.amount,
            color: c.color,
          }))}
        >
          <T size={12} color={colors.textMuted}>
            {shortDate(s.from)}~{shortDate(s.to)} 지출
          </T>
          <T size={type.body} weight="800" num>
            {won(s.expenseTotal)}원
          </T>
        </Donut>
      </View>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        {s.byCategory.slice(0, 3).map((c, i) => (
          <View key={c.categoryId} style={styles.catRow}>
            <T
              size={type.caption}
              weight="700"
              color={colors.textMuted}
              style={{ width: 14 }}
            >
              {i + 1}
            </T>
            <View style={[styles.catIcon, { backgroundColor: c.color + "1A" }]}>
              <CategoryIcon icon={c.icon} color={c.color} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.between}>
                <T weight="600">{c.name}</T>
                <T weight="700" num>
                  {won(c.amount)}원
                </T>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(c.amount / s.expenseTotal) * 100}%`,
                      backgroundColor: c.color,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function CompareCard() {
  const periods = usePeriods();
  const now = useSummary(periods?.current);
  const before = useSummary(periods?.previous);
  if (!periods || ((now.loading || before.loading) && !(now.data && before.data)))
    return <CardNote text="지출 기록을 불러오고 있어요" />;
  if (!now.data || !before.data)
    return <CardNote text="지출 기록을 불러오지 못했어요" />;
  const current = new Map(now.data.byCategory.map((c) => [c.categoryId, c]));
  const previous = new Map(
    before.data.byCategory.map((c) => [c.categoryId, c]),
  );
  // 이번 기간 많이 쓴 순, 그 뒤에 지난 기간에만 있던 카테고리
  const rows = [
    ...now.data.byCategory,
    ...before.data.byCategory.filter((c) => !current.has(c.categoryId)),
  ]
    .slice(0, 6)
    .map((c) => ({
      ...c,
      now: current.get(c.categoryId)?.amount ?? 0,
      before: previous.get(c.categoryId)?.amount ?? 0,
    }));
  if (!rows.length)
    return <CardNote text="두 기간 모두 기록한 지출이 아직 없어요" />;
  const p = periods;
  return (
    <View style={styles.card}>
      <View style={styles.between}>
        <T size={type.caption} color={colors.textMuted}>
          카테고리
        </T>
        <T size={type.caption} color={colors.textMuted}>
          {shortDate(p.previous.from)}~{shortDate(p.previous.to)} 대비
        </T>
      </View>
      {rows.map((c) => {
        const diff = c.now - c.before;
        const up = diff > 0;
        return (
          <View key={c.categoryId} style={styles.catRow}>
            <View style={[styles.catIcon, { backgroundColor: c.color + "1A" }]}>
              <CategoryIcon icon={c.icon} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="600">{c.name}</T>
              <T size={type.caption} color={colors.textMuted} num>
                {won(c.before)} → {won(c.now)}원
              </T>
            </View>
            {diff !== 0 && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: up
                      ? colors.dangerSoft
                      : colors.positiveSoft,
                  },
                ]}
              >
                <T
                  size={type.caption}
                  weight="700"
                  color={up ? colors.danger : colors.positive}
                  num
                >
                  {up ? "▲" : "▼"} {won(Math.abs(diff))}
                </T>
              </View>
            )}
          </View>
        );
      })}
      <T size={type.caption} color={colors.textMuted}>
        이번 기간({shortDate(p.current.from)}~{shortDate(p.current.to)})과 바로
        앞 같은 일수를 비교했어요
      </T>
    </View>
  );
}

/** 아직 없는 메뉴(약속 설정)를 누르면 띄운다. */
function SoonModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dim}>
        <View style={[styles.dialog, floating]} accessibilityViewIsModal>
          <T size={18} weight="700" accessibilityRole="header">
            기능 업데이트 예정이에요
          </T>
          <T size={14} color={colors.textSub} style={{ lineHeight: 21 }}>
            약속 설정은 다음 업데이트에서 만나 볼 수 있어요. 지금은 예산
            변경·지출 흐름·자유 질문을 이용해 주세요.
          </T>
          <Button label="확인" style={{ height: 48 }} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  center: { textAlign: "center" },
  roomHeader: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
  },
  chatIntro: { alignItems: "center", gap: space[1], paddingBottom: space[2] },
  chatIntroImg: { width: 64, height: 64 },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { height: 210, alignItems: "center", justifyContent: "center" },
  heroImg: { width: 180, height: 180 },
  dots: {
    position: "absolute",
    // 화면 폭과 상관없이 캐릭터(가운데 180px) 오른쪽 위 머리 옆에 붙인다
    top: 28,
    left: "50%",
    marginLeft: 66,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.card,
    ...elevation1,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  selectContent: { padding: space[5], paddingTop: 0, gap: space[5] },
  mateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[2],
    paddingBottom: space[5],
  },
  cta: {
    height: 54,
    borderRadius: radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 16px rgba(0,70,255,0.25)",
  },
  menuContent: { padding: space[5], paddingTop: 0, gap: space[5] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  topic: {
    flexBasis: "46%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: space[5],
    paddingHorizontal: space[3],
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    ...elevation1,
  },
  topicIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    backgroundColor: "#EEF3FF",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    backgroundColor: "#F3F5F9",
    fontSize: type.meta,
    color: colors.text,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#EEF3FF",
  },
  listContent: { padding: space[4], gap: space[3] },
  botRow: {
    flexDirection: "row",
    gap: space[2],
    alignItems: "flex-start",
    maxWidth: "92%",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSlot: { width: 40 },
  // 얼굴이 보이게 크게 놓고 살짝 내린다
  avatarImg: { width: 58, height: 58, transform: [{ translateY: 5 }] },
  bubble: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: 18,
    maxWidth: "100%",
  },
  bot: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderTopLeftRadius: 6,
    ...elevation1,
  },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderTopRightRadius: 6,
    maxWidth: "80%",
  },
  typing: {
    width: 150,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E6EEFF",
    justifyContent: "center",
    paddingHorizontal: space[4],
  },
  typingBar: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.soft,
    padding: space[4],
    gap: space[3],
    ...elevation1,
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.sunken,
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3 },
  catRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  action: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.card,
  },
  actionMain: { backgroundColor: colors.brand },
  dim: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(16,26,51,0.45)",
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.dialog,
    padding: space[6],
    gap: space[3],
  },
});
