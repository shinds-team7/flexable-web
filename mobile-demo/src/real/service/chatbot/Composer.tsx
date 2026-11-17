import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/real/components/ui";
import { colors, noOutline } from "@/real/theme";
import { useVoiceInput } from "../voiceInput";
import { stopSpeaking } from "../voiceReply";
import { COMPOSER_HINT } from "./model";
import { styles } from "./styles";

/**
 * 키보드가 입력창을 가리지 않게 한다.
 * Android는 키보드 상단과 실제 대화방 하단이 겹치는 만큼만 올린다.
 * 전체 키보드 높이를 빼면 이미 줄어든 창·안전영역에서 중복 보정될 수 있다.
 */
export function KeyboardFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [kb, setKb] = useState(0);
  const frame = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const measureOverlap = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) return;
    frame.current?.measureInWindow((_x, y, _width, height) => {
      if (keyboardTop.current === top) setKb(Math.max(0, y + height - top));
    });
  }, []);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      measureOverlap();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      setKb(0);
    });
    // 메뉴에서 입력한 채 대화로 넘어와 키보드가 이미 떠 있어도 보정한다.
    keyboardTop.current = Keyboard.metrics()?.screenY ?? null;
    measureOverlap();
    return () => {
      keyboardTop.current = null;
      show.remove();
      hide.remove();
    };
  }, [measureOverlap]);
  if (Platform.OS === "android") {
    return (
      <View
        ref={frame}
        collapsable={false}
        onLayout={measureOverlap}
        style={[styles.root, { paddingBottom: kb }]}
      >
        {children}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "web" ? undefined : "padding"}
      keyboardVerticalOffset={insets.top}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export function Composer({
  initial,
  busy,
  onSend,
  onListening,
}: {
  initial?: string;
  busy?: boolean;
  onSend: (text: string) => void;
  /** 듣는 중인지 알린다(대화 화면이 "…" 말풍선을 띄운다) */
  onListening?: (listening: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial ?? "");
  // 음성 입력을 시작할 때 입력창에 있던 글. 들은 문장은 그 뒤에 붙인다
  const base = useRef("");
  const voiceSent = useRef(false);
  const onVoice = useCallback(
    (text: string, final: boolean) => {
      const next = base.current ? `${base.current} ${text}` : text;
      if (final && !voiceSent.current && !busy && next.trim()) {
        voiceSent.current = true;
        onSend(next.trim());
        setDraft("");
      } else if (!voiceSent.current) setDraft(next);
    },
    [busy, onSend],
  );
  const voice = useVoiceInput(onVoice);
  const listening = voice.status !== "idle";
  useEffect(() => {
    onListening?.(listening);
  }, [listening, onListening]);
  const ready = !!draft.trim() && !busy;
  const send = () => {
    if (!ready) return;
    if (listening) voice.stop();
    onSend(draft.trim());
    setDraft("");
  };
  return (
    <View style={{ flexShrink: 0 }}>
      {/* 듣는 중에는 안내 줄 없이 마이크 버튼만 빨간 멈춤으로 바뀐다. 실패 안내만 보여 준다 */}
      {!listening && voice.notice && (
        <View style={styles.voiceStatus}>
          <T
            size={13}
            color={colors.danger}
            accessibilityRole="alert"
            style={{ flex: 1 }}
          >
            {voice.notice}
          </T>
        </View>
      )}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="AI 메이트에게 질문"
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            voice.clearNotice();
          }}
          onSubmitEditing={send}
          placeholder={COMPOSER_HINT}
          placeholderTextColor={colors.placeholder}
          maxLength={1000}
          style={[styles.input, noOutline]}
          returnKeyType="send"
        />
        {voice.available && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              listening ? "음성 입력 멈추기" : "음성으로 질문하기"
            }
            accessibilityState={{ busy: listening }}
            onPress={
              listening
                ? voice.stop
                : () => {
                    base.current = draft.trim();
                    voiceSent.current = false;
                    stopSpeaking();
                    void voice.start();
                  }
            }
            style={[
              styles.send,
              {
                backgroundColor: listening ? colors.danger : "#EEF3FF",
              },
            ]}
          >
            <Ionicons
              name={listening ? "stop" : "mic"}
              size={20}
              color={listening ? colors.onBrand : colors.brandDark}
            />
          </Pressable>
        )}
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
    </View>
  );
}
