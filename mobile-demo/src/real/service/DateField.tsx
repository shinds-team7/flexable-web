import { View } from "react-native";
import { T } from "@/real/components/ui";
import { colors, font, radius } from "@/real/theme";
// The native picker has no web build. The browser's date input gives the calendar.
const style = {
  fontFamily: font,
  fontSize: 16,
  minHeight: 52,
  padding: "0 16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: radius.soft,
  backgroundColor: colors.card,
  color: colors.text,
  boxSizing: "border-box" as const,
  width: "100%",
};
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <T size={14} weight="700" color={colors.textSub}>
        {label}
      </T>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={style}
      />
    </View>
  );
}
