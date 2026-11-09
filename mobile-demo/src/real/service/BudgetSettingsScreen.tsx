import { useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Button, styles as ui, T } from "@/real/components/ui";
import { goBack, SubHeader } from "@/real/components/SubHeader";
import { useToast } from "@/real/components/Toast";
import { colors } from "@/real/theme";
import { api } from "./api/client";
import {
  FixedExpensesEditor,
  PaydayPicker,
  ProtectedItemsEditor,
  fixedValid,
  protectedValid,
} from "./BudgetFields";
import { useSession } from "./Session";
import type { BudgetSettings } from "./types";
import { ErrorNotice, Loading, MoneyField, useResource } from "./ui";

type Saved = BudgetSettings & {
  fixedExpenses: (BudgetSettings["fixedExpenses"][number] & { id?: number })[];
  protectedItems: (BudgetSettings["protectedItems"][number] & {
    id?: number;
  })[];
};

/**
 * 마이 → 예산 설정 바꾸기. 저장된 설정 전체(잔액, 수입일·수입액, 고정지출, 카드 미결제액, 모아둔 돈, 매달 저축할 돈)를
 * 한 화면에 순서대로 보여 주고 바로 고쳐 저장한다(PUT /budget/settings). 처음 가입할 때의 단계별 설정은 그대로다.
 */
export function BudgetSettingsScreen() {
  const res = useResource<Saved>("/budget/settings");
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SubHeader title="예산 설정" fallback="/profile" />
      {res.loading && !res.data && <Loading />}
      {!res.data && <ErrorNotice error={res.error} retry={res.retry} />}
      {/* 불러온 값으로 한 번만 채운다. 저장 뒤 다시 들어오면 서버 값을 새로 읽는다 */}
      {res.data && <Form initial={res.data} />}
    </View>
  );
}

function Form({ initial }: { initial: Saved }) {
  const session = useSession();
  const toast = useToast();
  const [v, setV] = useState<BudgetSettings>(() => ({
    balance: initial.balance,
    balanceAt: initial.balanceAt,
    payday: initial.payday,
    incomeAmount: initial.incomeAmount,
    cardUnpaid: initial.cardUnpaid,
    fixedExpenses: initial.fixedExpenses.map(({ name, amount, day }) => ({
      name,
      amount,
      day,
    })),
    protectedItems: initial.protectedItems.map(({ name, amount }) => ({
      name,
      amount,
    })),
    seedBase: initial.seedBase,
  }));
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current) return;
    const amounts = [v.balance, v.incomeAmount, v.cardUnpaid, v.seedBase ?? 0];
    if (amounts.some((a) => !Number.isSafeInteger(a) || a < 0 || a >= 1e12))
      return setError("금액은 0원 이상, 1조 미만으로 입력해 주세요");
    if (!Number.isInteger(v.payday) || v.payday < 1 || v.payday > 31)
      return setError("수입일은 1~31일로 골라 주세요");
    if (v.fixedExpenses.some((x) => !fixedValid(x)))
      return setError("고정지출의 이름, 금액, 날짜를 확인해 주세요");
    if (v.protectedItems.some((x) => !protectedValid(x)))
      return setError("저축 항목의 이름과 금액을 확인해 주세요");
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api("/budget/settings", { method: "PUT", body: v });
      session.invalidate();
      toast("예산 설정을 저장했어요", undefined, "top");
      goBack("/profile");
    } catch (e) {
      lock.current = false;
      setBusy(false);
      setError(e);
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={ui.screen}
        showsVerticalScrollIndicator={false}
      >
        {/* 제목은 칸마다 하나, 모두 같은 크기(Section). 칸 위 글자는 숨기고 화면 읽기 라벨로만 둔다(11-08) */}
        <Section title="생활비 잔액">
          <MoneyField
            label="생활비 잔액 (원)"
            hideLabel
            value={v.balance}
            onChange={(balance) =>
              // 새 잔액은 지금 기준이다. 예전 기준 시각을 두면 이미 반영된 거래를 또 빼게 된다
              setV({ ...v, balance, balanceAt: new Date().toISOString() })
            }
          />
        </Section>
        <Section title="매달 수입일">
          <PaydayPicker
            hideLabel
            value={v.payday}
            onChange={(payday) => setV({ ...v, payday })}
          />
        </Section>
        <Section title="예정 수입액">
          <MoneyField
            label="예정 수입액 (원)"
            hideLabel
            value={v.incomeAmount}
            onChange={(incomeAmount) => setV({ ...v, incomeAmount })}
          />
        </Section>
        <Section title="고정지출">
          <FixedExpensesEditor
            items={v.fixedExpenses}
            onChange={(fixedExpenses) => setV({ ...v, fixedExpenses })}
            onError={setError}
          />
        </Section>
        <Section title="카드 미결제액">
          <MoneyField
            label="카드 미결제액 (원)"
            hideLabel
            placeholder="없으면 비워 두세요"
            value={v.cardUnpaid}
            onChange={(cardUnpaid) => setV({ ...v, cardUnpaid })}
          />
        </Section>
        <Section
          title="모아둔 돈"
          note="생활비와 따로 모아둔 돈이에요"
        >
          <MoneyField
            label="모아둔 돈 (원)"
            hideLabel
            placeholder="없으면 비워 두세요"
            value={v.seedBase ?? 0}
            onChange={(seedBase) => setV({ ...v, seedBase })}
          />
        </Section>
        <Section
          title="매달 저축할 돈"
          note="오늘 쓸 수 있는 돈에서 미리 빼 두고, 수입일 전날 시드머니에 반영해요"
        >
          <ProtectedItemsEditor
            items={v.protectedItems}
            onChange={(protectedItems) => setV({ ...v, protectedItems })}
            onError={setError}
          />
        </Section>
        <ErrorNotice error={error} />
        <Button
          label={busy ? "저장 중…" : "저장하기"}
          disabled={busy}
          onPress={save}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <View style={{ gap: 4 }}>
        <T size={17} weight="800" accessibilityRole="header">
          {title}
        </T>
        {note && (
          <T size={13} color={colors.textMuted}>
            {note}
          </T>
        )}
      </View>
      {children}
    </View>
  );
}
