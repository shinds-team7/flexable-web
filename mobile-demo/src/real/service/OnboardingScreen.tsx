import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { OnboardingFrame } from "@/real/components/OnboardingFrame";
import { Button, Card, T } from "@/real/components/ui";
import { useBudgetDraft } from "./BudgetDraft";
import { api } from "./api/client";
import { useSession } from "./Session";
import {
  ErrorNotice,
  Field,
  Guard,
  Loading,
  MoneyField,
  money,
  useResource,
} from "./ui";
import type { BudgetSettings, Today } from "./types";
import { colors } from "@/real/theme";
const steps = [
  "index",
  "balance",
  "income",
  "fixed",
  "card",
  "seed",
  "protect",
  "done",
] as const;
type Step = (typeof steps)[number];
const path = (step: string) =>
  step === "index"
    ? ("/budget-settings" as const)
    : (`/budget-settings/${step}` as "/budget-settings/balance");
export function OnboardingScreen({ step }: { step: Step }) {
  return (
    <Guard>
      <Content step={step} />
    </Guard>
  );
}
function Content({ step }: { step: Step }) {
  const state = useBudgetDraft();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  // The exact draft object last PUT; a retry after a later step fails re-sends only if the input changed.
  const saved = useRef<BudgetSettings | null>(null);
  const [error, setError] = useState<unknown>();
  // Only one fixed/protected item is expanded at a time; "확인" folds it into a summary row.
  const [open, setOpen] = useState<number | null>(null);
  if (!state.draft)
    return state.error ? <ErrorNotice error={state.error} /> : <Loading />;
  const { value: v, editing } = state.draft;
  const set = state.set;
  const idx = steps.indexOf(step);
  const next = async () => {
    if (lock.current) return;
    setError(undefined);
    if (step === "index") {
      lock.current = true;
      setBusy(true);
      try {
        if (state.draft?.editing && state.draft.step !== "index") {
          router.push(path(state.draft.step));
        } else if (session.user?.onboarded) {
          await state.begin(true);
          router.push("/budget-settings/balance");
        } else if (state.draft?.step && state.draft.step !== "index")
          router.push(path(state.draft.step));
        else {
          await state.begin(false);
          router.push("/budget-settings/balance");
        }
      } catch (e) {
        setError(e);
      } finally {
        lock.current = false;
        setBusy(false);
      }
      return;
    }
    const amount =
      step === "balance"
        ? v.balance
        : step === "income"
          ? v.incomeAmount
          : step === "card"
            ? v.cardUnpaid
            : step === "seed"
              ? (v.seedBase ?? 0)
              : undefined;
    if (
      amount !== undefined &&
      (!Number.isSafeInteger(amount) || amount < 0 || amount >= 1e12)
    ) {
      setError("금액은 0원 이상, 1조 미만으로 입력해 주세요");
      return;
    }
    if (
      step === "income" &&
      (!Number.isInteger(v.payday) || v.payday < 1 || v.payday > 31)
    ) {
      setError("수입일은 1~31일로 입력해 주세요");
      return;
    }
    if (step === "fixed" && v.fixedExpenses.some((x) => !fixedValid(x))) {
      setError("고정지출의 이름, 금액, 날짜를 확인해 주세요");
      return;
    }
    if (
      step === "protect" &&
      v.protectedItems.some(
        (x) => !x.name.trim() || x.amount < 1 || x.amount >= 1e12,
      )
    ) {
      setError("저축 항목의 이름과 금액을 확인해 주세요");
      return;
    }
    if (step === "protect") {
      lock.current = true;
      setBusy(true);
      try {
        if (saved.current !== v) {
          await api("/budget/settings", { method: "PUT", body: v });
          saved.current = v;
        }
        await session.refreshUser();
        session.invalidate();
        await state.reset();
        router.replace("/budget-settings/done");
      } catch (e) {
        setError(e);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    } else {
      const dest = steps[idx + 1];
      set(v, dest);
      router.push(path(dest));
    }
  };
  if (step === "done") return <Done />;
  const title = {
    index: session.user?.onboarded
      ? "예산을 다시 맞춰요"
      : "오늘 쓸 수 있는 돈을 알아볼까요?",
    balance: "생활비로 쓸 수 있는 돈이 얼마 있나요?",
    income: "다음 수입은 언제 들어오나요?",
    fixed: "매달 꼭 나가는 돈이 있나요?",
    card: "아직 내지 않은 카드값이 있나요?",
    seed: "지금까지 모아둔 돈이 있나요?",
    protect: "매달 얼마씩 저축할까요?",
  }[step];
  const subtitle = {
    index:
      "입력한 정보로 오늘 쓸 수 있는 돈을 계산해요. 실제 은행 잔액과 다를 수 있어요",
    balance:
      "생활비 통장의 지금 잔액을 적어 주세요. 이미 모아둔 저축은 빼고, 뒤에서 '모아둔 돈'으로 따로 넣으면 돼요",
    income: "예정 수입액은 지금 잔액에 더하지 않아요",
    fixed: "없으면 다음으로 넘어가도 돼요",
    card: "이미 썼지만 아직 결제되지 않은 금액이에요. 없으면 비워 두고 넘어가도 돼요",
    seed: "생활비와 따로 모아둔 돈이에요. 시드머니의 시작 금액이 되고, 오늘 쓸 수 있는 돈에는 넣지 않아요. 없으면 비워 두세요",
    protect:
      "오늘 쓸 수 있는 돈에서 미리 빼 두고, 수입일 전날 알림으로 시드머니에 반영해요. 없으면 비워 두세요",
  }[step];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <OnboardingFrame
        step={idx + 1}
        total={8}
        title={title}
        subtitle={subtitle}
        backFallback={editing ? "/my" : "/"}
        onCancel={
          editing
            ? async () => {
                await state.reset();
                router.dismissTo("/my");
              }
            : undefined
        }
        cta={
          busy
            ? "저장 중…"
            : step === "index"
              ? state.draft.step !== "index"
                ? "이어서 설정하기"
                : "시작하기"
              : step === "protect"
                ? "완료"
                : "다음"
        }
        disabled={busy}
        onNext={next}
      >
        {step === "balance" && (
          <>
            <MoneyField
              label="생활비 잔액 (원)"
              placeholder="예: 850,000"
              value={v.balance}
              onChange={(balance) =>
                // A new balance is as of now. Keeping the old balanceAt would subtract
                // transactions already reflected in it a second time.
                set({ ...v, balance, balanceAt: new Date().toISOString() })
              }
            />
            {v.balance === 0 && (
              <T color={colors.warn}>
                잔액이 0원이면 오늘 쓸 수 있는 돈도 0원이에요
              </T>
            )}
          </>
        )}
        {step === "income" && (
          <>
            <Field
              label="매달 수입일 (1~31)"
              keyboardType="number-pad"
              value={String(v.payday || "")}
              onChangeText={(s) =>
                set({
                  ...v,
                  payday: Number(s.replace(/[^0-9]/g, "").slice(0, 2)),
                })
              }
            />
            <Button
              label="매달 말일"
              variant="soft"
              onPress={() => set({ ...v, payday: 31 })}
            />
            {v.payday === 31 && <T>매달 말일에 맞춰 계산해요</T>}
            <MoneyField
              label="예정 수입액 (원)"
              value={v.incomeAmount}
              onChange={(incomeAmount) => set({ ...v, incomeAmount })}
            />
          </>
        )}
        {step === "fixed" && (
          <>
            {v.fixedExpenses.map((x, i) => {
              const update = (patch: Partial<typeof x>) =>
                set({
                  ...v,
                  fixedExpenses: v.fixedExpenses.map((a, j) =>
                    j === i ? { ...a, ...patch } : a,
                  ),
                });
              return (
                <ItemCard
                  key={i}
                  open={open === i}
                  summary={`${x.name} · ${money(x.amount)}원 · 매달 ${x.day === 31 ? "말일" : `${x.day}일`}`}
                  onEdit={() => setOpen(i)}
                  onConfirm={() => {
                    if (!fixedValid(x))
                      return setError(
                        "고정지출의 이름, 금액, 날짜를 확인해 주세요",
                      );
                    setError(undefined);
                    setOpen(null);
                  }}
                  onRemove={() => {
                    setOpen(null);
                    set({
                      ...v,
                      fixedExpenses: v.fixedExpenses.filter((_, j) => j !== i),
                    });
                  }}
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
                  <Field
                    label="매달 나가는 날 (31 = 말일)"
                    placeholder="예: 25"
                    keyboardType="number-pad"
                    value={String(x.day || "")}
                    onChangeText={(s) =>
                      update({
                        day: Number(s.replace(/[^0-9]/g, "").slice(0, 2)),
                      })
                    }
                  />
                </ItemCard>
              );
            })}
            <Button
              label="+ 고정지출 추가"
              variant="soft"
              disabled={v.fixedExpenses.length >= 30 || open !== null}
              onPress={() => {
                setOpen(v.fixedExpenses.length);
                set({
                  ...v,
                  fixedExpenses: [
                    ...v.fixedExpenses,
                    { name: "", amount: 0, day: 0 },
                  ],
                });
              }}
            />
          </>
        )}
        {step === "card" && (
          <MoneyField
            label="카드 미결제액 (원)"
            placeholder="없으면 비워 두세요"
            value={v.cardUnpaid}
            onChange={(cardUnpaid) => set({ ...v, cardUnpaid })}
          />
        )}
        {step === "seed" && (
          <MoneyField
            label="모아둔 돈 (원)"
            placeholder="없으면 비워 두세요"
            value={v.seedBase ?? 0}
            onChange={(seedBase) => set({ ...v, seedBase })}
          />
        )}
        {step === "protect" && (
          <>
            {v.protectedItems.map((x, i) => {
              const update = (patch: Partial<typeof x>) =>
                set({
                  ...v,
                  protectedItems: v.protectedItems.map((a, j) =>
                    j === i ? { ...a, ...patch } : a,
                  ),
                });
              return (
                <ItemCard
                  key={i}
                  open={open === i}
                  summary={`${x.name} · ${money(x.amount)}원`}
                  onEdit={() => setOpen(i)}
                  onConfirm={() => {
                    if (!x.name.trim() || x.amount < 1 || x.amount >= 1e12)
                      return setError(
                        "저축 항목의 이름과 금액을 확인해 주세요",
                      );
                    setError(undefined);
                    setOpen(null);
                  }}
                  onRemove={() => {
                    setOpen(null);
                    set({
                      ...v,
                      protectedItems: v.protectedItems.filter(
                        (_, j) => j !== i,
                      ),
                    });
                  }}
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
              disabled={v.protectedItems.length >= 30 || open !== null}
              onPress={() => {
                setOpen(v.protectedItems.length);
                set({
                  ...v,
                  protectedItems: [
                    ...v.protectedItems,
                    { name: "", amount: 0 },
                  ],
                });
              }}
            />
          </>
        )}
        <ErrorNotice error={error ?? state.error} />
      </OnboardingFrame>
    </KeyboardAvoidingView>
  );
}
function Done() {
  const { data, error, loading, retry } = useResource<Today>("/budget/today");
  return (
    <OnboardingFrame
      step={8}
      total={8}
      title="오늘의 예산을 준비했어요"
      subtitle="입력한 잔액·기록 기준 추정"
      backFallback="/"
      back={false}
      cta="홈으로"
      onNext={() => router.replace("/")}
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice error={error} retry={retry} />
      ) : (
        data && (
          <Card style={{ gap: 12 }}>
            <T>오늘 쓸 수 있는 돈</T>
            <T size={32} weight="800">
              {money(data.todayAvailable)}원
            </T>
            {data.shortage > 0 && (
              <T color={colors.danger}>
                다음 수입일까지 {money(data.shortage)}원이 부족해요
              </T>
            )}
            <T>다음 수입일까지 {data.daysLeft}일 남았어요</T>
          </Card>
        )
      )}
    </OnboardingFrame>
  );
}
function fixedValid(x: { name: string; amount: number; day: number }) {
  return (
    !!x.name.trim() &&
    x.amount >= 1 &&
    x.amount < 1e12 &&
    Number.isInteger(x.day) &&
    x.day >= 1 &&
    x.day <= 31
  );
}
function ItemCard({
  open,
  summary,
  onEdit,
  onConfirm,
  onRemove,
  children,
}: {
  open: boolean;
  summary: string;
  onEdit: () => void;
  onConfirm: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  if (!open)
    return (
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 12,
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
          label="지우기"
          variant="ghost"
          onPress={onRemove}
          style={{ flex: 1 }}
        />
        <Button
          label="확인"
          variant="soft"
          onPress={onConfirm}
          style={{ flex: 2 }}
        />
      </View>
    </Card>
  );
}
