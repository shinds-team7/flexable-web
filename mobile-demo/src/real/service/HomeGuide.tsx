import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Modal } from "@/components/PhoneModal";
import Svg, { Circle, Defs, Mask, Rect } from "react-native-svg";
import { Button, styles as ui, T } from "@/real/components/ui";
import {
  hasGuideTarget,
  measureGuideTarget,
  type GuideRect,
} from "@/real/components/guideTargets";
import { colors, floating } from "@/real/theme";
import { useSession } from "./Session";
import { readStorage, writeStorage } from "./storage";

/**
 * 사용 가이드(코치 마크). 홈의 실제 버튼·카드를 하나씩 밝게 비추고 옆에 설명을 띄운다(11-08, 예전에는 가운데 카드 3장).
 * 처음 가입해 예산 설정을 마친 사용자에게 한 번 보이고, 마이 [사용 가이드 다시 보기]로 다시 볼 수 있다.
 * 온보딩 완료·다시 보기가 이 기기에 "pending"을 남기고, 홈은 가입 선물·출석 모달이 모두 닫힌 뒤 가이드를 띄운다.
 * 끝내거나 건너뛰면 "done"으로 바꿔 다시 띄우지 않는다. 기기마다 따로 저장한다(다른 기기·재설치는 보이지 않음).
 * 가리킬 요소는 components/guideTargets에 id로 등록돼 있고, 화면에 없는 요소(꺼진 AI 메이트 등)의 단계는 건너뛴다.
 */
const key = (userId: number) => `flexable.service.homeGuide.${userId}`;

/** 온보딩을 처음 마쳤을 때, 마이에서 다시 보기를 눌렀을 때 부른다. 실패해도 가이드만 안 보일 뿐이라 조용히 넘긴다 */
export function markHomeGuidePending(userId: number) {
  return writeStorage(key(userId), "pending").catch(() => {});
}

export function useHomeGuide() {
  const { user } = useSession();
  const id = user?.id;
  const [state, setState] = useState<{ id: number; pending: boolean }>();
  // 마이에서 다시 보기를 누르고 홈으로 돌아올 때도 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      if (id === undefined) return;
      let alive = true;
      readStorage(key(id))
        .then((v) => alive && setState({ id, pending: v === "pending" }))
        .catch(() => alive && setState({ id, pending: false }));
      return () => {
        alive = false;
      };
    }, [id]),
  );
  const finish = useCallback(() => {
    if (id === undefined) return;
    setState({ id, pending: false });
    void writeStorage(key(id), "done").catch(() => {});
  }, [id]);
  return { pending: state?.id === id && !!state?.pending, finish };
}

/** target: components/guideTargets에 등록된 id */
type Step = { target: string; title: string; body: string };

const STEPS: Step[] = [
  {
    target: "record",
    title: "+ 버튼으로 거래를 기록해요",
    body: "수입/지출을 직접 입력하거나, 결제내역 스크린샷으로 여러 건을 한 번에 기록해요.\n카드 결제 자동 기록도 지원해요.",
  },
  {
    target: "hero",
    title: "오늘 쓸 수 있는 돈",
    body: "입력한 잔액·기록 기준으로 다음 수입일까지 나눈 오늘 예산이에요. 옆으로 밀면 시드머니 카드가 나와요",
  },
  {
    target: "character",
    title: "캐릭터를 누르면 상점을 볼 수 있어요",
    body: "코인으로 코스튬을 사고 바꿔 입힐 수 있어요",
  },
  {
    target: "gauge",
    title: "예산을 지키면 단계가 올라가요",
    body: "출석하고 하루 예산을 지키면 점수가 쌓여요. 위의 [레벨 안내]에서 점수 규칙과 단계를 볼 수 있어요",
  },
  {
    target: "attendance",
    title: "출석 체크",
    body: "하루 한 번 홈에 오면 출석이 되고 코인을 받아요. 달력에서 출석한 날을 볼 수 있어요",
  },
  {
    target: "coin",
    title: "내 코인",
    body: "누르면 코인 내역이 열려요. 시간이 지나 모은 코인을 [모으기]로 받을 수 있어요",
  },
  {
    target: "ai",
    title: "AI 메이트에게 물어보세요",
    body: "입력한 잔액·기록 기준으로 예산 질문에 답하고, 말한 일정을 예정 지출로 정리해 줘요",
  },
  {
    target: "inbox",
    title: "알림함",
    body: "예산 초과, 고정지출 자동 기록, 코인 지급 같은 소식을 날짜별로 모아 봐요",
  },
  {
    target: "tab:마이",
    title: "마이",
    body: "예산 설정 바꾸기, 카테고리 관리, 계정 설정이 있어요. 이 가이드도 여기서 다시 볼 수 있어요",
  },
  {
    target: "tab:마이",
    title: "카드 결제 알림을 자동으로 기록해요",
    body: "Android에서 마이 → [카드 자동 기록]으로 들어가 동의하고 알림 접근을 허용한 뒤 켜 주세요. 신한·삼성·현대·KB국민·롯데·NH농협카드 앱의 국내 원화 승인 알림을 모아, 앱을 열면 지출로 기록해요. 취소·해외 결제는 직접 확인해 주세요",
  },
  {
    target: "tab:마이",
    title: "알림창에서 오늘 남은 예산을 봐요",
    body: "Android에서 마이 → [알림창에 오늘 남은 예산]을 켜면 휴대폰 알림창에서 남은 예산을 볼 수 있어요. 기본은 꺼져 있고, 직접 켤 때 알림 권한을 요청해요. 필요 없으면 언제든 다시 끌 수 있어요",
  },
];

/** 비춘 칸 둘레 여백과 설명 카드 폭 */
const PAD = 6;
const CARD_MAX = 360;
const GAP = 12;
const EDGE = 16;

export function HomeGuide({
  visible,
  onPrepare,
  onDone,
}: {
  visible: boolean;
  onPrepare: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [opened, setOpened] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [measured, setMeasured] = useState<{
    key: string;
    rect: GuideRect | null;
  }>();
  const [cardHeight, setCardHeight] = useState(250);
  const { width, height } = useWindowDimensions();
  // 열릴 때 지금 화면에 있는 요소만 단계로 쓴다(렌더 중 갱신: 열린 순간 한 번)
  if (visible !== opened) {
    setOpened(visible);
    setPrepared(false);
    setMeasured(undefined);
    if (visible) {
      setIndex(0);
      setSteps(STEPS.filter((st) => hasGuideTarget(st.target)));
    }
  }
  useEffect(() => {
    if (!visible) return;
    onPrepare();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPrepared(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [visible, onPrepare]);

  const step = steps[Math.min(index, steps.length - 1)];
  // 잰 위치는 어느 단계·화면 크기에서 잰 것인지와 함께 둔다. 다르면 아직 재는 중이다
  const measureKey = `${step?.target}:${width}x${height}`;
  useEffect(() => {
    if (!visible || !prepared || !step) return;
    let alive = true;
    // 모달이 뜬 뒤에 잰다(바로 재면 레이아웃 전일 수 있다)
    const t = setTimeout(() => {
      void measureGuideTarget(step.target).then(
        (r) => alive && setMeasured({ key: measureKey, rect: r }),
      );
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [visible, prepared, step, measureKey]);
  // undefined: 재는 중, null: 화면에서 못 찾음(가운데 카드로 보인다)
  const rect = measured?.key === measureKey ? measured.rect : undefined;

  const last = index >= steps.length - 1;
  const done = () => {
    setIndex(0);
    onDone();
  };
  if (!visible || !prepared || !step) return null;

  const circular = !["hero", "character", "gauge"].includes(step.target);
  const diameter = rect ? Math.max(rect.width, rect.height) + PAD * 2 : 0;
  const hole =
    rect &&
    (circular
      ? {
          x: rect.x + rect.width / 2 - diameter / 2,
          y: rect.y + rect.height / 2 - diameter / 2,
          w: diameter,
          h: diameter,
        }
      : {
          x: rect.x - PAD,
          y: rect.y - PAD,
          w: rect.width + PAD * 2,
          h: rect.height + PAD * 2,
        });
  const cardWidth = Math.min(width - EDGE * 2, CARD_MAX);
  const cardLeft = hole
    ? Math.min(
        Math.max(EDGE, hole.x + hole.w / 2 - cardWidth / 2),
        width - EDGE - cardWidth,
      )
    : (width - cardWidth) / 2;
  // 비춘 칸이 화면 위쪽이면 그 아래에, 아래쪽이면 그 위에 설명을 둔다
  const below = hole ? hole.y + hole.h / 2 < height / 2 : false;
  const desiredTop = hole
    ? below
      ? hole.y + hole.h + GAP
      : hole.y - GAP - cardHeight
    : (height - cardHeight) / 2;
  const cardPos = {
    top: Math.max(EDGE, Math.min(desiredTop, height - EDGE - cardHeight)),
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={done}
    >
      <View style={StyleSheet.absoluteFill}>
        <Svg
          width={width}
          height={height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <Mask
              id="home-guide-mask"
              x={0}
              y={0}
              width={width}
              height={height}
              maskUnits="userSpaceOnUse"
            >
              <Rect width={width} height={height} fill="white" />
              {hole &&
                (circular ? (
                  <Circle
                    cx={hole.x + hole.w / 2}
                    cy={hole.y + hole.h / 2}
                    r={hole.w / 2}
                    fill="black"
                  />
                ) : (
                  <Rect
                    x={hole.x}
                    y={hole.y}
                    width={hole.w}
                    height={hole.h}
                    rx={14}
                    fill="black"
                  />
                ))}
            </Mask>
          </Defs>
          <Rect
            width={width}
            height={height}
            fill="rgba(16,26,51,0.62)"
            mask="url(#home-guide-mask)"
          />
          {hole &&
            (circular ? (
              <Circle
                id="home-guide-highlight"
                cx={hole.x + hole.w / 2}
                cy={hole.y + hole.h / 2}
                r={hole.w / 2}
                fill="none"
                stroke="white"
                strokeWidth={2}
              />
            ) : (
              <Rect
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={14}
                fill="none"
                stroke="white"
                strokeWidth={2}
              />
            ))}
        </Svg>
        {rect !== undefined && (
          <View
            style={[
              ui.dialog,
              floating,
              s.card,
              { width: cardWidth, left: cardLeft },
              cardPos,
            ]}
            accessibilityViewIsModal
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            <View style={s.cardHeader}>
              <T size={13} weight="700" color={colors.brandDark}>
                {index + 1} / {steps.length}
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="건너뛰기"
                onPress={done}
                style={s.skip}
              >
                <T
                  size={13}
                  color={colors.textMuted}
                  style={{ textDecorationLine: "underline" }}
                >
                  건너뛰기
                </T>
              </Pressable>
            </View>
            <T
              size={18}
              weight="800"
              accessibilityRole="header"
              style={{ marginTop: 6 }}
            >
              {step.title}
            </T>
            <T
              size={15}
              color={colors.textSub}
              style={{ marginTop: 6, lineHeight: 22 }}
            >
              {step.body}
            </T>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Button
                label="이전"
                variant="neutral"
                style={{ flex: 1, height: 48 }}
                disabled={index === 0}
                onPress={() => setIndex(Math.max(0, index - 1))}
              />
              <Button
                label={last ? "시작하기" : "다음"}
                style={{ flex: 1, height: 48 }}
                onPress={last ? done : () => setIndex(index + 1)}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.sunken,
  },
  card: { position: "absolute", padding: 20 },
});
