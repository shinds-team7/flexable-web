import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState, type ReactNode } from "react";
import {
  type ViewStyle,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Modal } from "@/components/PhoneModal";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { Button, T } from "@/real/components/ui";
import { colors, floating, pressTransition, space, type } from "@/real/theme";
import { KeyboardFrame, Composer } from "./Composer";
import { mateImg, type MateId, mates, type TopicId, topics } from "./model";
import { styles } from "./styles";

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

export type Speaker = { on: boolean; toggle: () => void };

/** 선택·메뉴·대화 공통 헤더. 세 화면이 같은 헤더를 써서 가운데만 바뀌는 한 대화방처럼 보인다. 설정 버튼이 없으면 자리만 둬 제목을 가운데에 맞춘다. */
export function RoomHeader({
  onBack,
  onSettings,
  speaker,
}: {
  onBack: () => void;
  onSettings?: () => void;
  /** AI 음성 답변 켜기/끄기(대화 화면) */
  speaker?: Speaker;
}) {
  return (
    <View style={styles.roomHeader}>
      <BackButton onPress={onBack} />
      {/* 오른쪽 버튼이 둘이면 왼쪽에도 자리를 둬 제목을 가운데에 맞춘다 */}
      {speaker && <View style={styles.backBtn} />}
      <T size={17} weight="800" style={[styles.center, { flex: 1 }]}>
        AI 메이트
      </T>
      {speaker && (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="AI 음성 답변"
          accessibilityState={{ checked: speaker.on }}
          aria-checked={speaker.on}
          onPress={speaker.toggle}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Ionicons
            name={speaker.on ? "volume-high" : "volume-mute-outline"}
            size={24}
            color={speaker.on ? colors.brand : colors.textMuted}
          />
        </Pressable>
      )}
      {onSettings ? (
        <SettingsButton onPress={onSettings} />
      ) : (
        <View style={styles.backBtn} />
      )}
    </View>
  );
}

/** 선택·메뉴·대화의 가운데 내용이 바뀔 때 살짝 올라오며 나타나게 한다. */
export function EnterView({
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
export function MateSelect({
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
export function Menu({
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
    <KeyboardFrame>
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
    </KeyboardFrame>
  );
}

/** 아직 없는 메뉴(약속 설정)를 누르면 띄운다. */
export function SoonModal({
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
