import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Button, RadioMark, Sheet, T } from "@/real/components/ui";
import { colors, floating, radius } from "@/real/theme";
import { styles as heroStyles } from "@/real/components/HomeStyles";
import { api } from "./api/client";
import { ErrorNotice, MoneyField, money } from "./ui";
import type { SeedChoice, SeedMoney } from "./types";
/**
 * 시드머니 합계 카드. 카드를 누르면 모은 기록(맨 아래 [시드머니 수정])이 열리고, [+]를 누르면 지금 예산에서 시드머니로 보낼 돈을 적는 창이 열린다.
 * 수입일 전날부터는 반영 창이 뜬다. 반영하기 전까지는 홈에 올 때마다 다시 뜬다
 * (다음 수입일 전날이 되면 서버가 지난 주기를 넘긴다). 반영한 돈은 생활비 잔액에서 빠지므로 onChanged로 홈과 시드머니를 다시 읽는다.
 * seed는 홈이 GET /budget/seed-money로 읽어 넘긴다(서버가 이 기능 전이면 홈이 카드를 그리지 않는다).
 */
export function SeedMoneyCard({
  seed,
  onChanged,
  style,
}: {
  seed: SeedMoney;
  onChanged: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [later, setLater] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [edit, setEdit] = useState(false);
  const pending = seed.pending;
  return (
    <>
      {/* Same blue panel as the today card it sits beside. Pressing it opens the history. */}
      <Pressable
        style={[heroStyles.hero, style]}
        accessibilityRole="button"
        accessibilityLabel="시드머니 모은 기록 보기"
        onPress={() => setHistory(true)}
      >
        <T size={15} weight="700" color={colors.onBrand}>
          시드머니
        </T>
        <View style={styles.amountRow}>
          <T
            size={38}
            weight="800"
            color={colors.onBrand}
            num
            style={{ flex: 1, lineHeight: 46 }}
            accessibilityLabel={`시드머니 ${money(seed.total)}원`}
          >
            {money(seed.total)}
            <T size={22} weight="700" color={colors.onBrand}>
              {" "}
              원
            </T>
          </T>
          <Pressable
            style={styles.icon}
            accessibilityRole="button"
            accessibilityLabel="시드머니로 돈 보내기"
            hitSlop={8}
            onPress={() => setTransfer(true)}
          >
            <Ionicons name="add" size={36} color={colors.onBrand} />
          </Pressable>
        </View>
        <View style={[heroStyles.heroFoot, styles.foot]}>
          <T size={12} color={colors.onBrandSub} num>
            모아둔 돈 {money(seed.base)}원 + 반영한 돈 {money(seed.saved)}원 ·
            매달 {money(seed.monthlyGoal)}원 저축
          </T>
        </View>
      </Pressable>
      <Sheet
        visible={history}
        onClose={() => setHistory(false)}
        title="시드머니 모은 기록"
      >
        <ScrollView contentContainerStyle={{ gap: 16 }}>
          <T>
            모아둔 돈 {money(seed.base)}원 · 반영한 돈 {money(seed.saved)}원
          </T>
          <T size={13} color={colors.textMuted}>
            최근 12개 반영 기록이에요
          </T>
          {seed.entries.length === 0 && (
            <T>아직 시드머니에 반영한 기록이 없어요</T>
          )}
          {seed.entries.map((entry) => (
            <View
              key={entry.cycleEnd}
              style={{
                gap: 4,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <T weight="700">{money(entry.amount)}원</T>
              <T size={13}>
                {entry.choice === "EXTRA" ? entry.cycleEnd : `${entry.cycleEnd}까지`} ·{" "}
                {
                  {
                    GOAL: "매달 저축할 돈",
                    ALL: "남은 돈 전부",
                    MANUAL: "직접 입력",
                    EXTRA: "바로 보냄",
                  }[entry.choice]
                }
              </T>
            </View>
          ))}
        </ScrollView>
        <Button
          label="시드머니 수정"
          variant="soft"
          style={{ marginTop: 16 }}
          onPress={() => {
            setHistory(false);
            setEdit(true);
          }}
        />
      </Sheet>
      {transfer && (
        <AmountModal
          title="시드머니로 보내기"
          caption={`지금 예산에서 최대 ${money(seed.movable)}원까지 보낼 수 있어요. 보낸 돈은 생활비 잔액에서 빠져요`}
          label="보낼 금액 (원)"
          initial={0}
          min={1}
          max={seed.movable}
          confirmLabel="보내기"
          busyLabel="보내는 중…"
          onClose={() => setTransfer(false)}
          submit={async (amount) => {
            await api("/budget/seed-money/transfers", {
              method: "POST",
              body: { amount },
            });
            onChanged();
          }}
        />
      )}
      {edit && (
        <AmountModal
          title="시드머니 수정"
          caption="모아둔 돈만 고쳐요. 반영한 돈과 보낸 돈 기록은 그대로예요"
          label="모아둔 돈 (원)"
          initial={seed.base}
          min={0}
          confirmLabel="저장"
          busyLabel="저장하는 중…"
          onClose={() => setEdit(false)}
          submit={async (base) => {
            await api("/budget/seed-money/base", {
              method: "PUT",
              body: { base },
            });
            onChanged();
          }}
        />
      )}
      {pending && later !== pending.cycleEnd && (
        <ReflectModal
          // A new cycle starts with a fresh choice.
          key={pending.cycleEnd}
          pending={pending}
          onLater={() => setLater(pending.cycleEnd)}
          onDone={onChanged}
        />
      )}
    </>
  );
}
type Pending = NonNullable<SeedMoney["pending"]>;
/** 금액 하나를 적어 저장하는 가운데 창. min·max를 벗어나면 저장할 수 없다. */
function AmountModal({
  title,
  caption,
  label,
  initial,
  min,
  max,
  confirmLabel,
  busyLabel,
  onClose,
  submit,
}: {
  title: string;
  caption: string;
  label: string;
  initial: number;
  min: number;
  max?: number;
  confirmLabel: string;
  busyLabel: string;
  onClose: () => void;
  submit: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const tooMuch = max !== undefined && amount > max;
  const save = async () => {
    if (busy || tooMuch || amount < min) return;
    setBusy(true);
    setError(undefined);
    try {
      await submit(amount);
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.dim}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.dialog, floating]} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={{ gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 6 }}>
              <T size={18} weight="700" accessibilityRole="header">
                {title}
              </T>
              <T size={14} color={colors.textSub} style={{ lineHeight: 21 }}>
                {caption}
              </T>
            </View>
            <MoneyField label={label} value={amount} onChange={setAmount} />
            {tooMuch && (
              <T size={13} color={colors.danger} accessibilityRole="alert">
                보낼 수 있는 돈({money(max)}원)보다 많아요
              </T>
            )}
            <ErrorNotice error={error} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label="취소"
                variant="soft"
                disabled={busy}
                style={{ flex: 1 }}
                onPress={onClose}
              />
              <Button
                label={busy ? busyLabel : confirmLabel}
                disabled={busy || tooMuch || amount < min}
                style={{ flex: 1 }}
                onPress={save}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
/**
 * 가운데 모달. 바깥을 눌러도 닫히지 않고 [나중에]로만 닫는다(Android 뒤로 가기도 나중에와 같다).
 * 금액은 서버가 정한 값을 그대로 보여 준다. 직접 입력만 사용자가 금액을 넣는다.
 */
function ReflectModal({
  pending,
  onLater,
  onDone,
}: {
  pending: Pending;
  onLater: () => void;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<SeedChoice>("GOAL");
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [, month, day] = pending.payday.split("-").map(Number);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api("/budget/seed-money/entries", {
        method: "POST",
        body: {
          cycleEnd: pending.cycleEnd,
          choice,
          ...(choice === "MANUAL" ? { amount } : {}),
        },
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const options: [SeedChoice, string, string | null, string | null][] = [
    ["GOAL", "매달 저축할 돈", `${money(pending.goalAmount)}원`, null],
    [
      "ALL",
      "실제로 모은 돈 전부",
      `${money(pending.allAmount)}원`,
      "매달 저축할 돈 + 이번 달 남은 생활비",
    ],
    ["MANUAL", "직접 입력", null, "옮길 금액을 내가 정해요"],
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <KeyboardAvoidingView
        style={styles.dim}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.dialog, floating]} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={{ gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 6 }}>
              <T size={18} weight="700" accessibilityRole="header">
                이번 달 모은 돈을 시드머니에 반영할까요?
              </T>
              <T size={14} color={colors.textSub} style={{ lineHeight: 21 }}>
                {month}월 {day}일 수입일 전날까지의 기록 기준이에요. 반영한 돈은
                생활비 잔액에서 빠져요
              </T>
            </View>
            <View style={styles.options} accessibilityRole="radiogroup">
              {options.map(([key, label, value, caption], i) => {
                const on = choice === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityLabel={value ? `${label} ${value}` : label}
                    accessibilityState={{ checked: on, disabled: busy }}
                    aria-checked={on}
                    disabled={busy}
                    onPress={() => setChoice(key)}
                    style={[
                      styles.option,
                      i > 0 && styles.optionLine,
                      on && { backgroundColor: colors.brandSoft },
                    ]}
                  >
                    <RadioMark on={on} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={16} weight={on ? "700" : "500"}>
                        {label}
                      </T>
                      {caption && (
                        <T size={13} color={colors.textMuted}>
                          {caption}
                        </T>
                      )}
                    </View>
                    {value && (
                      <T size={16} weight="700" num>
                        {value}
                      </T>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {choice === "MANUAL" && (
              <MoneyField
                label="반영할 금액 (원)"
                value={amount}
                onChange={setAmount}
              />
            )}
            <ErrorNotice error={error} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label="나중에"
                variant="soft"
                disabled={busy}
                style={{ flex: 1 }}
                onPress={onLater}
              />
              <Button
                label={busy ? "반영하는 중…" : "반영하기"}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={confirm}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.soft,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  // The caption may wrap to two lines, so the footer sits at the bottom instead of a fixed gap.
  foot: { marginTop: "auto" },
  dim: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(16,26,51,0.45)",
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "92%",
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: radius.dialog,
    padding: 22,
  },
  options: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.soft,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionLine: { borderTopWidth: 1, borderTopColor: colors.line },
});
