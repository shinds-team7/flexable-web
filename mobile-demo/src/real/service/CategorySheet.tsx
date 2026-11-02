import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Sheet, T } from "@/real/components/ui";
import { api } from "./api/client";
import { CategoryIcon, ErrorNotice, Field } from "./ui";
import { useSession } from "./Session";
import type { Category, Kind } from "./types";
import { colors } from "@/real/theme";
// Grays stay with the default 고정지출·기타 categories, so new ones pick from these six (design decision 10-22).
const palette = [
  "#12B76A",
  "#F79009",
  "#7A5AF8",
  "#2E90FA",
  "#EE46BC",
  "#15B79E",
];
const icons = [
  "restaurant",
  "cafe",
  "bag-handle",
  "bus",
  "film",
  "cart",
  "cash",
  "gift",
];
export function CategorySheet({
  visible,
  onClose,
  type,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  type: Kind;
  onCreated: (category: Category) => void;
}) {
  const session = useSession();
  const [name, setName] = useState("");
  const [color, setColor] = useState(palette[0]);
  const [icon, setIcon] = useState(icons[0]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current || !name.trim()) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const category = await api<Category>("/categories", {
        method: "POST",
        body: { name: name.trim(), type, color, icon },
      });
      onCreated(category);
      session.invalidate();
      setName("");
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="카테고리 추가"
    >
      <ScrollView
        style={{ maxHeight: 440 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 14, paddingBottom: 16 }}
      >
        <Field
          label="카테고리 이름 (20자 이내)"
          value={name}
          onChangeText={setName}
          maxLength={20}
        />
        <T weight="600">색상</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {palette.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={`색상 ${c}`}
              accessibilityState={{ checked: c === color }}
              aria-checked={c === color}
              onPress={() => setColor(c)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: c,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {c === color && <T color="#fff">✓</T>}
            </Pressable>
          ))}
        </View>
        <T weight="600">아이콘</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {icons.map((i) => (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityLabel={`아이콘 ${i}`}
              accessibilityState={{ checked: i === icon }}
              aria-checked={i === icon}
              onPress={() => setIcon(i)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                // Fill with the chosen color so the picked icon stands out from the rest.
                backgroundColor: i === icon ? color : "#EEF1F6",
                borderWidth: 2,
                borderColor: i === icon ? colors.text : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CategoryIcon icon={i} color={i === icon ? "#fff" : color} />
            </Pressable>
          ))}
        </View>
        <ErrorNotice error={error} />
        <Button
          label={busy ? "추가 중…" : error ? "다시 시도" : "추가하기"}
          disabled={busy || !name.trim()}
          onPress={save}
        />
      </ScrollView>
    </Sheet>
  );
}
