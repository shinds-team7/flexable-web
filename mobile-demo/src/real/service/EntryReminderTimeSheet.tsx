import { createElement, useState } from "react";
import { View } from "react-native";
import { Button, Sheet, T } from "@/real/components/ui";
import { colors, font, radius } from "@/real/theme";
import { parseReminderTime } from "./reminderSetting";

const pad = (n: number) => String(n).padStart(2, "0");
/** "21:30" → "오후 9:30" */
export function reminderTimeText(time: string) {
  const t = parseReminderTime(time);
  if (!t) return "";
  const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${t.hour < 12 ? "오전" : "오후"} ${h}:${pad(t.minute)}`;
}

/**
 * 기록 알림을 받을 시각을 고르는 시트. 시각을 정하면 기록이 없는 날 그 시각에 알리고,
 * [자동으로]를 누르면 마지막 기록 24시간 뒤에 알린다(밤이면 다음 날 오전 9시).
 * 기기 시간대 기준이다.
 */
export function EntryReminderTimeSheet({
  visible,
  time,
  onClose,
  onChange,
}: {
  visible: boolean;
  time: string | null;
  onClose: () => void;
  onChange: (time: string | null) => void;
}) {
  const initial = parseReminderTime(time) ?? { hour: 21, minute: 0 };
  const [draft, setDraft] = useState(initial);
  const save = () => {
    onChange(`${pad(draft.hour)}:${pad(draft.minute)}`);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="기록 알림 시간"
      subtitle="기록이 없는 날 이 시간에 알려 드려요"
    >
      <View style={{ gap: 16 }}>
        {/* 시연 웹: 기기 시간 선택기 대신 브라우저의 시간 입력을 쓴다 */}
        {createElement("input", {
          type: "time",
          value: `${pad(draft.hour)}:${pad(draft.minute)}`,
          "aria-label": "알림 시간 고르기",
          onChange: (e: { target: { value: string } }) => {
            const t = parseReminderTime(e.target.value);
            if (t) setDraft(t);
          },
          style: {
            fontFamily: font,
            fontSize: 16,
            minHeight: 52,
            padding: "0 16px",
            border: `1px solid ${colors.borderInput}`,
            borderRadius: radius.soft,
            backgroundColor: colors.card,
            color: colors.text,
            boxSizing: "border-box",
            width: "100%",
          },
        })}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="자동으로"
            variant="soft"
            style={{ flex: 1 }}
            onPress={() => {
              onChange(null);
              onClose();
            }}
          />
          <Button label="저장" style={{ flex: 1 }} onPress={save} />
        </View>
        <T size={12} color={colors.textMuted}>
          자동은 마지막 기록 24시간 뒤에 알려 드려요
        </T>
      </View>
    </Sheet>
  );
}
