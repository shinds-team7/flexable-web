import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Modal } from "@/components/PhoneModal";
import { CalendarPicker } from "@/real/components/CalendarPicker";
import { Button, T } from "@/real/components/ui";
import { colors, floating, noOutline, radius } from "@/real/theme";
import { won } from "@/real/utils/format";
import { CategoryPicker } from "./CategoryPicker";
import { draftButtons, parseAmount, type ScheduleDraft } from "./scheduleDraft";
import type { Category } from "./types";
import { CategoryIcon, seoulDate, useResource } from "./ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_DAYS = 90;

/** "2026-11-06" → "11/6(금)" */
function shortWhen(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

function plusDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type ScheduleSubmit = ScheduleDraft & {
  amount: number;
  edited: boolean;
};

/**
 * 예정 지출 한 줄 카드(날짜 · 금액 · 카테고리)와 [반영 | 수정]. AI 메이트 대화와 + 음성 입력이 같이 쓴다.
 * 날짜를 누르면 캘린더, 금액을 누르면 숫자 수정, 카테고리를 누르면 지출 카테고리 모달이 열린다.
 * 처음엔 [반영]만 켜지고, 하나라도 고치면 [반영]이 꺼지고 [수정]이 켜진다(scheduleDraft.draftButtons).
 * 등록(POST /scheduled-expenses)은 부르는 쪽이 한다.
 */
export function ScheduleCard({
  title,
  initial,
  categoryName,
  disabled,
  done,
  onSubmit,
}: {
  title: string;
  initial: ScheduleDraft;
  /** 서버가 알려 준 카테고리 이름(목록을 불러오기 전에 보여 준다) */
  categoryName?: string;
  disabled?: boolean;
  /** 이미 반영·수정을 눌렀으면 값만 보여 준다 */
  done?: boolean;
  onSubmit: (value: ScheduleSubmit) => void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(initial);
  const [amountText, setAmountText] = useState(
    initial.amount == null ? "" : String(initial.amount),
  );
  const [editingAmount, setEditingAmount] = useState(initial.amount == null);
  const [calendar, setCalendar] = useState(false);
  const [picker, setPicker] = useState(false);
  const categories = useResource<Category[]>("/categories?type=EXPENSE");
  const category = categories.data?.find((c) => c.id === draft.categoryId);
  const buttons = draftButtons(initial, draft);
  const locked = disabled || done;
  const today = seoulDate();

  const submit = (edited: boolean) => {
    if (locked || draft.amount == null) return;
    onSubmit({ ...draft, amount: draft.amount, edited });
  };

  return (
    <View style={styles.card}>
      <T size={13} weight="700" color={colors.textSub} numberOfLines={1}>
        {title}
      </T>
      <View style={styles.line}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`날짜 ${shortWhen(draft.date)}, 바꾸기`}
          disabled={locked}
          onPress={() => setCalendar(true)}
          style={styles.chip}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={colors.brandDark}
          />
          <T size={14} weight="700" num>
            {shortWhen(draft.date)}
          </T>
        </Pressable>
        <T color={colors.textMuted}>·</T>
        {editingAmount && !locked ? (
          <View style={[styles.chip, styles.amountInput]}>
            <TextInput
              accessibilityLabel="금액"
              value={amountText}
              autoFocus={initial.amount != null}
              keyboardType="number-pad"
              placeholder="금액"
              placeholderTextColor={colors.placeholder}
              maxLength={15}
              onChangeText={(t) => {
                const n = parseAmount(t);
                setAmountText(n == null ? "" : won(n));
                setDraft((d) => ({ ...d, amount: n }));
              }}
              onBlur={() => {
                if (draft.amount != null) setEditingAmount(false);
              }}
              onSubmitEditing={() => {
                if (draft.amount != null) setEditingAmount(false);
              }}
              style={[styles.amountText, noOutline]}
            />
            <T size={14} weight="700">
              원
            </T>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`금액 ${draft.amount == null ? "없음" : `${won(draft.amount)}원`}, 바꾸기`}
            disabled={locked}
            onPress={() => {
              setAmountText(draft.amount == null ? "" : won(draft.amount));
              setEditingAmount(true);
            }}
            style={styles.chip}
          >
            <T size={14} weight="800" num>
              {draft.amount == null ? "금액 입력" : `${won(draft.amount)}원`}
            </T>
          </Pressable>
        )}
        <T color={colors.textMuted}>·</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`카테고리 ${category?.name ?? categoryName ?? ""}, 바꾸기`}
          disabled={locked}
          onPress={() => setPicker(true)}
          style={styles.chip}
        >
          {category && (
            <CategoryIcon icon={category.icon} color={category.color} />
          )}
          <T size={14} weight="700" numberOfLines={1}>
            {category?.name ?? categoryName ?? "카테고리"}
          </T>
        </Pressable>
      </View>
      {!done && (
        <View style={styles.buttons}>
          <Button
            label="반영"
            disabled={locked || !buttons.apply}
            onPress={() => submit(false)}
            style={styles.button}
          />
          <Button
            label="수정"
            disabled={locked || !buttons.edit}
            onPress={() => submit(true)}
            style={styles.button}
          />
        </View>
      )}
      <CalendarPicker
        visible={calendar}
        value={draft.date}
        min={plusDays(today, 1)}
        max={plusDays(today, MAX_DAYS)}
        onCancel={() => setCalendar(false)}
        onConfirm={(date) => {
          setCalendar(false);
          setDraft((d) => ({ ...d, date }));
        }}
      />
      <Modal
        visible={picker}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(false)}
      >
        <View style={styles.dim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={() => setPicker(false)}
          />
          <View style={[styles.dialog, floating]} accessibilityViewIsModal>
            <View style={styles.dialogHead}>
              <T
                size={18}
                weight="700"
                accessibilityRole="header"
                style={{ flex: 1 }}
              >
                카테고리
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닫기"
                hitSlop={12}
                onPress={() => setPicker(false)}
              >
                <Ionicons name="close" size={22} color={colors.textSub} />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }}>
              <CategoryPicker
                list={categories.data ?? []}
                selected={draft.categoryId}
                onSelect={(id) => {
                  setDraft((d) => ({ ...d, categoryId: id }));
                  setPicker(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.soft,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    minHeight: 40,
    borderRadius: radius.soft,
    backgroundColor: colors.brandSoft,
    maxWidth: 140,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.card,
  },
  amountText: {
    minWidth: 72,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    paddingVertical: 6,
  },
  buttons: { flexDirection: "row", gap: 8 },
  button: { flex: 1, height: 44 },
  dim: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(16,24,40,0.45)",
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    maxHeight: "80%",
  },
  dialogHead: { flexDirection: "row", alignItems: "center" },
});
