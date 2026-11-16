import { StyleSheet } from "react-native";
import { colors, radius } from "@/real/theme";

export const styles = StyleSheet.create({
  hero: {
    minHeight: 196,
    flexGrow: 1,
    backgroundColor: colors.brand,
    borderRadius: radius.soft,
    padding: 18,
    paddingBottom: 12,
  },
  // Nothing left to spend today: the panel turns navy ink instead of red (design system: no red on the hero).
  heroEmpty: { backgroundColor: colors.text },
  heroChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroTop: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroFoot: {
    marginTop: "auto",
    paddingTop: 8,
    minHeight: 30,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
