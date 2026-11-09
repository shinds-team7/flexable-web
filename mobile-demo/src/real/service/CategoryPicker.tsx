import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { T } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";
import type { Category } from "./types";
import { CategoryIcon } from "./ui";

/**
 * 카테고리 고르기(아이콘 칸). 목록과 순서는 서버 `GET /categories?type=` 그대로다(사용자가 정한 순서, policies §7).
 * 거래 등록과 예정 지출 등록이 같이 쓴다. trailing은 목록 끝에 붙는 칸(거래 등록의 [+ 추가])이다.
 */
export function CategoryPicker({
  list,
  selected,
  onSelect,
  disabled,
  trailing,
}: {
  list: Category[];
  selected: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {list.map((c) => (
        <Pressable
          key={c.id}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityLabel={c.name}
          accessibilityState={{ checked: selected === c.id }}
          aria-checked={selected === c.id}
          onPress={() => onSelect(c.id)}
          style={{
            width: "30%",
            padding: 12,
            gap: 6,
            alignItems: "center",
            borderRadius: radius.soft,
            backgroundColor: selected === c.id ? colors.brandSoft : "#fff",
            borderWidth: 1,
            borderColor: selected === c.id ? colors.brand : colors.line,
          }}
        >
          <CategoryIcon icon={c.icon} color={c.color} />
          <T size={13} style={{ textAlign: "center" }}>
            {c.name}
          </T>
        </Pressable>
      ))}
      {trailing}
    </View>
  );
}
