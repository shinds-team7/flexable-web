import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { CalendarPicker } from "@/real/components/CalendarPicker";
import { T } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";
// value is "YYYY-MM-DD" in Seoul time. The pickers use device time, which is Seoul for our users.
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function toDate(value: string) {
  const [y, mo, d] = value.split("-").map(Number);
  return new Date(y, mo - 1, d);
}
/** "2026. 10. 20. (화)" */
export function dateText(value: string) {
  return `${value.replace(/-/g, ". ")}. (${DOW[toDate(value).getDay()]})`;
}
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  // 기기 기본 날짜 선택기 대신 앱 캘린더(파란 띠 + 흰 달력)를 띄운다
  const [open, setOpen] = useState(false);
  const text = dateText(value);
  return (
    <View style={{ gap: 8 }}>
      <T size={14} weight="700" color={colors.textSub}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${text}, 바꾸기`}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 52,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: colors.borderInput,
          borderRadius: radius.soft,
          backgroundColor: colors.card,
        }}
      >
        <T style={{ flex: 1 }} num>
          {text}
        </T>
        <Ionicons name="calendar-outline" size={20} color={colors.textSub} />
      </Pressable>
      <CalendarPicker
        visible={open}
        value={value}
        min={min}
        max={max}
        onCancel={() => setOpen(false)}
        onConfirm={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}
