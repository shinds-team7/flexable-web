import { useEffect, useState } from "react";
import { Animated, Image, Platform, Pressable, View } from "react-native";
import { T } from "@/real/components/ui";
import { colors, pressTransition, space, type } from "@/real/theme";
import { ScheduleCard, type ScheduleSubmit } from "../ScheduleCard";
import { BudgetCard, TopCard, CompareCard } from "./cards";
import { mateImg, type Choice, type Msg } from "./model";
import { styles } from "./styles";

/** 음성 입력으로 듣는 동안 사용자 쪽에 뜨는 "…" 말풍선. 점 세 개가 차례로 깜빡인다 */
export function ListeningBubble() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.35)));
  useEffect(() => {
    const native = Platform.OS !== "web";
    const loop = Animated.loop(
      Animated.stagger(
        180,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, {
              toValue: 1,
              duration: 300,
              useNativeDriver: native,
            }),
            Animated.timing(d, {
              toValue: 0.35,
              duration: 300,
              useNativeDriver: native,
            }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);
  return (
    <View
      style={[styles.bubble, styles.mine, styles.listening]}
      accessibilityLabel="음성을 듣고 있어요"
      accessibilityLiveRegion="polite"
    >
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.listeningDot, { opacity: d }]} />
      ))}
    </View>
  );
}

export function TypingBubble() {
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

export function MyBubble({ text }: { text: string }) {
  return (
    <View style={[styles.bubble, styles.mine]}>
      <Rich text={text} color={colors.onBrand} />
    </View>
  );
}

export function BotGroup({
  items,
  disabled,
  onAction,
  onSchedule,
}: {
  items: Msg[];
  disabled: boolean;
  onAction: (msgId: number, c: Choice) => void;
  onSchedule: (msgId: number, title: string, value: ScheduleSubmit) => void;
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
            {msg.schedule && (
              <ScheduleCard
                title={msg.schedule.title}
                categoryName={msg.schedule.category}
                initial={{
                  date: msg.schedule.date,
                  amount: msg.schedule.amount ?? null,
                  categoryId: msg.schedule.categoryId,
                }}
                disabled={disabled}
                done={msg.used}
                onSubmit={(v) => onSchedule(msg.id, msg.schedule!.title, v)}
              />
            )}
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
