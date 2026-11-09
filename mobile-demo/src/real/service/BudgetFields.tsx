import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { DayOfMonthPicker } from "@/real/components/CalendarPicker";
import { Button, Card, T } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";
import { Field, MoneyField, money } from "./ui";
import type { BudgetSettings } from "./types";

type FixedItem = BudgetSettings["fixedExpenses"][number];
type ProtectedItem = BudgetSettings["protectedItems"][number];

/** 고정지출 등록 화면 맨 위의 빠른 추가 이름(#256에서 확정, 11-06 관리비 빼고 전기세·가스비·교통비 추가) */
export const FIXED_PRESETS = [
  "월세",
  "통신비",
  "보험료",
  "구독료",
  "전기세",
  "가스비",
  "교통비",
];

/**
 * 수입일 선택. 한 줄에 왼쪽 [매달 말일], 오른쪽 날짜 버튼. 날짜 버튼은 1~31일 달력 창을 연다.
 * 31은 매달 말일과 같다(policies §1: 없는 날은 말일, 휴일이면 다음 평일). 값이 없으면(0) 1일로 보인다.
 */
export function PaydayPicker({
  value,
  onChange,
  hideLabel,
}: {
  value: number;
  onChange: (day: number) => void;
  /** 위의 "매달 수입일" 글자를 숨긴다(부르는 쪽이 같은 제목을 따로 둘 때) */
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = value >= 1 && value <= 31 ? value : 1;
  const last = shown === 31;
  return (
    <View style={{ gap: 8 }}>
      {!hideLabel && (
        <T size={14} weight="600" color={colors.textSub}>
          매달 수입일
        </T>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="매달 말일"
          accessibilityState={{ selected: last }}
          onPress={() => onChange(31)}
          style={({ pressed }) => [
            s.choice,
            last && s.choiceOn,
            pressed && { opacity: 0.7 },
          ]}
        >
          {last && (
            <Ionicons name="checkmark" size={18} color={colors.onBrand} />
          )}
          <T weight="700" color={colors.onBrand}>
            매달 말일
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`수입일 선택, ${shown}일`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            s.choice,
            s.date,
            pressed && { opacity: 0.7 },
          ]}
        >
          <T size={17} weight="700" num>
            {shown}일
          </T>
          <Ionicons name="chevron-down" size={18} color={colors.textSub} />
        </Pressable>
      </View>
      <T size={13} color={colors.textMuted}>
        {last
          ? "매달 말일에 맞춰 계산해요"
          : "없는 날짜는 그달 말일, 주말·공휴일이면 다음 평일로 계산해요"}
      </T>
      <DayOfMonthPicker
        visible={open}
        title="수입일"
        value={shown}
        onCancel={() => setOpen(false)}
        onConfirm={(d) => {
          setOpen(false);
          onChange(d);
        }}
      />
    </View>
  );
}

/** 고정지출 "매달 나가는 날" 칸. 누르면 1~31 달력 창. 0이면 아직 안 고른 것 */
function MonthDayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (day: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const text =
    value === 31 ? "매달 말일" : value >= 1 ? `매달 ${value}일` : "날짜 고르기";
  return (
    <View style={{ gap: 8 }}>
      <T size={14} weight="600" color={colors.textSub}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value >= 1 ? `${value}일` : "고르기"}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.choice, s.date, pressed && { opacity: 0.7 }]}
      >
        <T
          size={17}
          weight="700"
          num
          color={value >= 1 ? colors.text : colors.textMuted}
        >
          {text}
        </T>
        <Ionicons name="calendar-outline" size={18} color={colors.textSub} />
      </Pressable>
      <DayOfMonthPicker
        visible={open}
        title={label}
        value={value}
        onCancel={() => setOpen(false)}
        onConfirm={(d) => {
          setOpen(false);
          onChange(d);
        }}
      />
    </View>
  );
}

export function fixedValid(x: FixedItem) {
  return (
    !!x.name.trim() &&
    x.amount >= 1 &&
    x.amount < 1e12 &&
    Number.isInteger(x.day) &&
    x.day >= 1 &&
    x.day <= 31
  );
}

export function protectedValid(x: ProtectedItem) {
  return !!x.name.trim() && x.amount >= 1 && x.amount < 1e12;
}

/**
 * 펼친 항목 하나를 편집하는 상태. [취소]는 새로 추가한 항목이면 지우고, 기존 항목이면 수정 전 값으로 되돌린다.
 */
function useItemEditing<V>(items: V[], onChange: (next: V[]) => void) {
  const [open, setOpen] = useState<number | null>(null);
  const before = useRef<V | null>(null);
  return {
    open,
    add: (item: V) => {
      before.current = null;
      setOpen(items.length);
      onChange([...items, item]);
    },
    edit: (i: number) => {
      before.current = items[i];
      setOpen(i);
    },
    cancel: (i: number) => {
      const prev = before.current;
      setOpen(null);
      onChange(
        prev === null
          ? items.filter((_, j) => j !== i)
          : items.map((a, j) => (j === i ? prev : a)),
      );
    },
    close: () => setOpen(null),
    remove: (i: number) => {
      setOpen(null);
      onChange(items.filter((_, j) => j !== i));
    },
  };
}

export function FixedExpensesEditor({
  items,
  onChange,
  onError,
}: {
  items: FixedItem[];
  onChange: (next: FixedItem[]) => void;
  onError: (message?: string) => void;
}) {
  const e = useItemEditing(items, onChange);
  const full = items.length >= 30;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.chips}>
        {FIXED_PRESETS.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`${name} 추가`}
            disabled={full || e.open !== null}
            onPress={() => {
              onError(undefined);
              e.add({ name, amount: 0, day: 0 });
            }}
            style={({ pressed }) => [
              s.chip,
              (full || e.open !== null) && { opacity: 0.4 },
              pressed && { opacity: 0.6 },
            ]}
          >
            <T size={14} weight="700" color={colors.onBrand}>
              + {name}
            </T>
          </Pressable>
        ))}
      </View>
      {items.map((x, i) => {
        const update = (patch: Partial<FixedItem>) =>
          onChange(items.map((a, j) => (j === i ? { ...a, ...patch } : a)));
        return (
          <ItemCard
            key={i}
            open={e.open === i}
            summary={`${x.name} · ${money(x.amount)}원 · 매달 ${x.day === 31 ? "말일" : `${x.day}일`}`}
            onEdit={() => e.edit(i)}
            onConfirm={() => {
              if (!fixedValid(x))
                return onError("고정지출의 이름, 금액, 날짜를 확인해 주세요");
              onError(undefined);
              e.close();
            }}
            onCancel={() => {
              onError(undefined);
              e.cancel(i);
            }}
            onRemove={() => e.remove(i)}
          >
            <Field
              label="이름"
              placeholder="예: 월세"
              maxLength={40}
              value={x.name}
              onChangeText={(name) => update({ name })}
            />
            <MoneyField
              label="금액 (원)"
              placeholder="예: 700,000"
              value={x.amount}
              onChange={(amount) => update({ amount })}
            />
            <MonthDayField
              label="매달 나가는 날"
              value={x.day}
              onChange={(day) => update({ day })}
            />
          </ItemCard>
        );
      })}
      <Button
        label="+ 고정지출 추가"
        variant="soft"
        disabled={full || e.open !== null}
        onPress={() => {
          onError(undefined);
          e.add({ name: "", amount: 0, day: 0 });
        }}
      />
    </View>
  );
}

export function ProtectedItemsEditor({
  items,
  onChange,
  onError,
}: {
  items: ProtectedItem[];
  onChange: (next: ProtectedItem[]) => void;
  onError: (message?: string) => void;
}) {
  const e = useItemEditing(items, onChange);
  return (
    <View style={{ gap: 12 }}>
      {items.map((x, i) => {
        const update = (patch: Partial<ProtectedItem>) =>
          onChange(items.map((a, j) => (j === i ? { ...a, ...patch } : a)));
        return (
          <ItemCard
            key={i}
            open={e.open === i}
            summary={`${x.name} · ${money(x.amount)}원`}
            onEdit={() => e.edit(i)}
            onConfirm={() => {
              if (!protectedValid(x))
                return onError("저축 항목의 이름과 금액을 확인해 주세요");
              onError(undefined);
              e.close();
            }}
            onCancel={() => {
              onError(undefined);
              e.cancel(i);
            }}
            onRemove={() => e.remove(i)}
          >
            <Field
              label="이름"
              placeholder="예: 적금"
              maxLength={40}
              value={x.name}
              onChangeText={(name) => update({ name })}
            />
            <MoneyField
              label="금액 (원)"
              placeholder="예: 300,000"
              value={x.amount}
              onChange={(amount) => update({ amount })}
            />
          </ItemCard>
        );
      })}
      <Button
        label="+ 저축할 돈 추가"
        variant="soft"
        disabled={items.length >= 30 || e.open !== null}
        onPress={() => {
          onError(undefined);
          e.add({ name: "", amount: 0 });
        }}
      />
    </View>
  );
}

function ItemCard({
  open,
  summary,
  onEdit,
  onConfirm,
  onCancel,
  onRemove,
  children,
}: {
  open: boolean;
  summary: string;
  onEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  if (!open)
    return (
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 68,
          paddingVertical: 20,
        }}
      >
        <T weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {summary}
        </T>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <T color={colors.brandDark} weight="600">
            수정
          </T>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8}>
          <T color={colors.textMuted} weight="600">
            삭제
          </T>
        </Pressable>
      </Card>
    );
  return (
    <Card style={{ gap: 12 }}>
      {children}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          label="취소"
          variant="neutral"
          onPress={onCancel}
          style={{ flex: 1 }}
        />
        <Button
          label="확인"
          onPress={onConfirm}
          style={{ flex: 2, backgroundColor: colors.brandDark }}
        />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  choice: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    gap: 6,
    borderRadius: radius.soft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  // 매달 말일은 늘 파랑 바탕·흰 글자, 고르면 더 짙은 파랑 + 체크
  choiceOn: { backgroundColor: colors.brandDark },
  date: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
});
