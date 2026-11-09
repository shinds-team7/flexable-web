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
 * Android는 edge-to-edge라 창이 줄어들지 않고 KeyboardAvoidingView 계산도 어긋나
 * 입력창이 반쯤 가려졌다. 키보드 높이를 직접 읽어 화면 아래 안전영역을 뺀 만큼 올린다.
 */
export function KeyboardFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKb(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (Platform.OS === "android") {
    return (
      <View
        style={[
          styles.root,
          { paddingBottom: Math.max(0, kb - insets.bottom) },
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "web" ? undefined : "padding"}
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
  const onVoice = useCallback(
    (text: string) => setDraft(base.current ? `${base.current} ${text}` : text),
    [],
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
    <View>
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
