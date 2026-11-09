import Ionicons from "@expo/vector-icons/Ionicons";
import { type ComponentProps } from "react";
import { ApiError } from "../api/client";
import type { ChatRequest, ChatResponse } from "../types";

export const mateImg = require("../../../../assets/real/chatbot/mate.png");

export const MATE_KEY = "chatbot.mate";

export const COMPOSER_HINT = "궁금한 내용을 입력해보세요...";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-06" → "11/6(금)" */
export function whenText(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

type IconName = ComponentProps<typeof Ionicons>["name"];

export type MateId = NonNullable<ChatRequest["mate"]>;

export type Proposal = NonNullable<ChatResponse["action"]>;

export type Schedule = NonNullable<Proposal["schedule"]>;

export type CardKind = "budget" | "top" | "compare";

export type Choice = { label: string; run: () => void };

/** ui: 화면 안내용 말풍선(인사·메뉴 안내·오류). 모델에 보내는 대화에서 뺀다. */
export type Msg = {
  id: number;
  from: "bot" | "me";
  text: string;
  card?: CardKind;
  choices?: Choice[];
  /** 예정 지출 제안. 한 줄 카드와 [반영 | 수정]을 붙인다 */
  schedule?: Schedule;
  used?: boolean;
  ui?: boolean;
};

export type Step = "loading" | "select" | "menu" | "chat";

/** AI 메이트 스타일. 처음 한 번 고르고, 이후엔 설정(톱니)에서만 바꾼다. */
export const mates: {
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

export type TopicId = "plan" | "budget" | "spend" | "free";

/** soon: 아직 서버 기능이 없어 누르면 '업데이트 예정' 안내만 띄운다. */
export const topics: {
  id: TopicId;
  title: string;
  desc: string;
  icon: IconName;
  soon?: boolean;
}[] = [
  {
    id: "plan",
    title: "약속 설정",
    desc: "약속을 말하면\n예정 지출로 등록해요",
    icon: "calendar",
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
export const topicIntro: Record<
  TopicId,
  { text: string; quick: { label: string; card?: CardKind }[] }
> = {
  plan: {
    text: "앞으로 있을 약속을 날짜와 함께 말해 주세요. 입력한 기록으로 쓸 돈을 예상해 드리고, [반영]을 누르면 예정 지출로 등록해요. 마이크 버튼으로 말해도 돼요.",
    quick: [
      { label: "이번 주 금요일에 친구랑 저녁" },
      { label: "토요일에 영화 보기" },
      { label: "다음 주 월요일 회식" },
    ],
  },
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

export function errorText(e: unknown) {
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
export function ro(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/** 'YYYY-MM-DD'에 날짜 더하기(UTC 기준이라 시간대와 무관). */
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const shortDate = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

/** 이어진 봇 말풍선은 아바타 하나로 묶는다. */
export function groupBot(msgs: Msg[]) {
  const out: { from: Msg["from"]; items: Msg[] }[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (m.from === "bot" && last?.from === "bot") last.items.push(m);
    else out.push({ from: m.from, items: [m] });
  }
  return out;
}
