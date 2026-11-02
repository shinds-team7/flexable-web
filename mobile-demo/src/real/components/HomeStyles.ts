import { StyleSheet } from "react-native";
import { colors, radius } from "@/real/theme";

export const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand,
    borderRadius: radius.soft,
    padding: 22,
    paddingBottom: 14,
  },
  // Nothing left to spend today: the panel turns navy ink instead of red (design system: no red on the hero).
  heroEmpty: { backgroundColor: colors.text },
  heroChip: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  heroFoot: {
    marginTop: 14,
    paddingTop: 12,
    minHeight: 36,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
