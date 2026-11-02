import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useFocusEffect } from "expo-router";
import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Button, Card, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { colors, fontStyle, noOutline, radius } from "@/real/theme";
import { useSession } from "./Session";
import { api, errorText } from "./api/client";
export const money = (n: number) => n.toLocaleString("ko-KR");
export const digits = (s: string) =>
  s
    .replace(/[^0-9]/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 13);
// 1px 테두리, 입력 중에는 2px 신한 블루. 테두리가 두꺼워지는 만큼 안쪽 여백을 줄여 글자가 움직이지 않게 한다.
export function Field({
  label,
  hideLabel,
  help,
  right,
  ...props
}: TextInputProps & {
  label: string;
  /** 칸 위 글자를 숨긴다(스크린리더는 label을 그대로 읽는다) */
  hideLabel?: boolean;
  help?: string;
  ref?: Ref<TextInput>;
  right?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {!hideLabel && (
        <T size={14} weight="700" color={colors.textSub}>
          {label}
        </T>
      )}
      <View style={{ position: "relative" }}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            {
              fontSize: 16,
              minHeight: 52,
              paddingVertical: 14,
              paddingHorizontal: focused ? 15 : 16,
              borderWidth: focused ? 2 : 1,
              borderColor: focused ? colors.brand : colors.borderInput,
              borderRadius: radius.soft,
              backgroundColor: colors.card,
              color: colors.text,
            },
            noOutline,
            right ? { paddingRight: 52 } : undefined,
            props.style,
            fontStyle(StyleSheet.flatten(props.style)?.fontWeight),
          ]}
        />
        {right && (
          <View
            style={{
              position: "absolute",
              right: 6,
              top: 4,
              bottom: 4,
              justifyContent: "center",
            }}
          >
            {right}
          </View>
        )}
      </View>
      {help && (
        <T size={13} color={colors.textMuted}>
          {help}
        </T>
      )}
    </View>
  );
}
// 0 shows as an empty field so the placeholder example stays visible.
export function MoneyField({
  label,
  value,
  onChange,
  placeholder = "0",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
}) {
  return (
    <Field
      label={label}
      keyboardType="number-pad"
      placeholder={placeholder}
      value={value ? money(value) : ""}
      onChangeText={(s) => onChange(Number(digits(s)))}
    />
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <Card style={{ backgroundColor: colors.dangerSoft, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <T color={colors.danger} style={{ flex: 1 }} accessibilityRole="alert">
          {typeof error === "string" ? error : errorText(error)}
        </T>
      </View>
      {retry && <Button label="다시 시도" variant="soft" onPress={retry} />}
    </Card>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 30, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={colors.brand} />
      <T>불러오는 중이에요</T>
    </View>
  );
}
export function Guard({
  children,
  budget = false,
}: {
  children: ReactNode;
  budget?: boolean;
}) {
  const s = useSession();
  if (!s.ready) return <Loading />;
  if (s.error) return <ErrorNotice error={s.error} retry={s.retry} />;
  if (!s.user) return <Redirect href="/" />;
  if (budget && !s.user.onboarded) return <Redirect href="/budget-settings" />;
  return <>{children}</>;
}
export function Page({
  title,
  footer,
  children,
}: {
  title: string;
  /** 화면 아래에 고정되는 주 버튼 자리(하단 고정 CTA) */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SubHeader title={title} fallback="/" />
      <Screen>{children}</Screen>
      {footer && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 20,
            gap: 4,
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
export function CategoryIcon({ icon, color }: { icon: string; color: string }) {
  const name = (
    icon in Ionicons.glyphMap ? icon : "pricetag"
  ) as ComponentProps<typeof Ionicons>["name"];
  return <Ionicons name={name} color={color} size={22} />;
}
// Retain the last successful snapshot on connection failure, but never reuse it across users or date ranges.
export function useResource<T>(path: string | null) {
  const { revision, user } = useSession();
  const [nonce, bump] = useState(0);
  const userId = user?.id;
  const identity = `${userId}:${path}`;
  const [state, setState] = useState<{
    identity: string;
    data?: T;
    error?: unknown;
    loading: boolean;
    confirmedAt?: Date;
  }>({ identity, loading: true });
  const current = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const refresh = `${revision}:${nonce}`;
      const seq = ++current.current;
      const controller = new AbortController();
      setState((previous) => ({
        ...(previous.identity === identity ? previous : { identity }),
        loading: !!path,
        error: undefined,
      }));
      if (!path) return;
      api<T>(path, { signal: controller.signal })
        .then((data) => {
          if (seq === current.current && refresh)
            setState({
              identity,
              data,
              loading: false,
              confirmedAt: new Date(),
            });
        })
        .catch((error) => {
          if (seq === current.current)
            setState((previous) => ({ ...previous, error, loading: false }));
        });
      return () => {
        ++current.current;
        controller.abort();
      };
    }, [identity, path, revision, nonce]),
  );
  return {
    ...(state.identity === identity
      ? state
      : {
          loading: !!path,
          data: undefined,
          error: undefined,
          confirmedAt: undefined,
        }),
    retry: () => bump((x) => x + 1),
  };
}
export function seoulDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}
export function seoulTime() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16);
}
// The server sends microseconds (".123456+09:00"). Trim to milliseconds so every engine parses it.
export function parseTime(iso: string) {
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1"));
}
// "YYYY-MM-DDTHH:mm" in Seoul time. Falls back to now so a bad value can't crash a screen.
export function toSeoulInput(iso: string) {
  const ms = parseTime(iso).getTime();
  return Number.isNaN(ms)
    ? seoulTime()
    : new Date(ms + 9 * 3600000).toISOString().slice(0, 16);
}
