import { Redirect, router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { OnboardingFrame } from "@/real/components/OnboardingFrame";
import { Card, T } from "@/real/components/ui";
import {
  FixedExpensesEditor,
  PaydayPicker,
  ProtectedItemsEditor,
  fixedValid,
  protectedValid,
} from "./BudgetFields";
import { useBudgetDraft } from "./BudgetDraft";
import { markHomeGuidePending } from "./HomeGuide";
import { api } from "./api/client";
import { useSession } from "./Session";
import { SeedMoneyHelp } from "./SeedMoneyHelp";
import { statementResultText, useStatementImport } from "./StatementImport";
import {
  ErrorNotice,
  Guard,
  Loading,
  MoneyField,
  money,
  useResource,
} from "./ui";
import type { BudgetSettings, Today } from "./types";
import { colors } from "@/real/theme";
const steps = ["balance", "income", "fixed", "protect", "done"] as const;
type Step = (typeof steps)[number];
const path = (step: Step) => `/onboarding/${step}` as "/onboarding/balance";
/** 저장된 임시 입력의 단계를 지금 화면으로 옮긴다. card·seed는 수입·잔액 화면에 합쳐졌다. */
function resumeStep(saved: string): Step {
  if (saved === "card") return "income";
  if (saved === "seed") return "balance";
  return steps.find((x) => x === saved) ?? "balance";
}
export function OnboardingScreen({ step }: { step: Step | "index" }) {
  return (
    <Guard>{step === "index" ? <Start /> : <Content step={step} />}</Guard>
  );
}
/** /onboarding은 화면 없이 임시 입력을 준비하고 이어서 할 단계로 보낸다. */
function Start() {
  const state = useBudgetDraft();
  const session = useSession();
  const [dest, setDest] = useState<Href>();
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  const draft = state.draft;
  useEffect(() => {
    if (!draft || started.current === attempt) return;
    started.current = attempt;
    (async () => {
      try {
        if (
          draft.step !== "index" &&
          (draft.editing || !session.user?.onboarded)
        )
          setDest(path(resumeStep(draft.step)));
        else {
          await state.begin(!!session.user?.onboarded);
          setDest(path("balance"));
        }
      } catch (e) {
        setError(e);
      }
    })();
  }, [draft, attempt, session.user?.onboarded, state]);
  if (dest) return <Redirect href={dest} />;
  if (error || state.error)
    return (
      <ErrorNotice
        error={error ?? state.error}
        retry={() => {
          setError(undefined);
          setAttempt((n) => n + 1);
        }}
      />
    );
  return <Loading />;
}
function Content({ step }: { step: Step }) {
  const state = useBudgetDraft();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  // The exact draft object last PUT; a retry after a later step fails re-sends only if the input changed.
  const saved = useRef<BudgetSettings | null>(null);
  const [error, setError] = useState<unknown>();
  const [importNote, setImportNote] = useState<string>();
  const statement = useStatementImport({
    onDone: (result) => {
      setImportNote(statementResultText(result));
      // 저장한 거래가 내역·분석 화면에 바로 보이게 한다
      session.invalidate();
    },
    onError: (message) => {
      if (message) setImportNote(undefined);
      setError(message);
    },
  });
  if (!state.draft)
    return state.error ? <ErrorNotice error={state.error} /> : <Loading />;
  const { value: v, editing } = state.draft;
  const set = state.set;
  const idx = steps.indexOf(step);
  const next = async () => {
    if (lock.current) return;
    setError(undefined);
    const amounts =
      step === "balance"
        ? [v.balance, v.seedBase ?? 0]
        : step === "income"
          ? [v.incomeAmount, v.cardUnpaid]
          : [];
    if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0 || n >= 1e12)) {
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
      v.protectedItems.some((x) => !protectedValid(x))
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
        // 처음 가입해 설정을 마쳤을 때만 첫 홈 가이드를 남긴다(다시 설정할 때는 아님)
        const user = session.user;
        if (user && !user.onboarded) await markHomeGuidePending(user.id);
        await session.refreshUser();
        session.invalidate();
        await state.reset();
        router.replace("/onboarding/done");
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
    balance: "예산 설정하기",
    income: "다음 수입은 언제 들어오나요?",
    fixed: "매달 꼭 나가는 돈이 있나요?",
    protect: "매달 얼마씩 저축할까요?",
  }[step];
  const subtitle = {
    balance: "통장의 지금 잔액과 모아둔 돈을 적어주세요",
    income: undefined,
    fixed: "없으면 다음으로 넘어가도 돼요",
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
        total={steps.length}
        title={title}
        subtitle={subtitle}
        back={editing || idx > 0}
        backFallback={idx > 0 ? path(steps[idx - 1]) : editing ? "/profile" : "/"}
        onCancel={
          editing
            ? async () => {
                await state.reset();
                router.dismissTo("/profile");
              }
            : undefined
        }
        cta={busy ? "저장 중…" : step === "protect" ? "완료" : "다음"}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <T size={14} weight="700">
                모아둔 돈
              </T>
              <SeedMoneyHelp label size={14} />
            </View>
            <MoneyField
              label="모아둔 돈 (원)"
              hideLabel
              placeholder="없으면 비워 두세요"
              value={v.seedBase ?? 0}
              onChange={(seedBase) => set({ ...v, seedBase })}
            />
          </>
        )}
        {step === "income" && (
          <>
            <PaydayPicker
              value={v.payday}
              onChange={(payday) => set({ ...v, payday })}
            />
            <MoneyField
              label="예정 수입액 (원)"
              value={v.incomeAmount}
              onChange={(incomeAmount) => set({ ...v, incomeAmount })}
            />
            <View style={{ marginTop: 16, gap: 4 }}>
              <T size={17} weight="700">
                아직 내지 않은 카드값이 있나요?
              </T>
              <T size={14} color={colors.textMuted}>
                이미 썼지만 아직 결제되지 않은 금액이에요. 없으면 비워 두고
                넘어가도 돼요
              </T>
            </View>
            <MoneyField
              label="카드 미결제액 (원)"
              placeholder="없으면 비워 두세요"
              value={v.cardUnpaid}
              onChange={(cardUnpaid) => set({ ...v, cardUnpaid })}
            />
          </>
        )}
        {step === "fixed" && (
          <FixedExpensesEditor
            items={v.fixedExpenses}
            onChange={(fixedExpenses) => set({ ...v, fixedExpenses })}
            onError={setError}
            onImportPdf={statement.start}
            importBusy={statement.busy}
            importNote={importNote}
          />
        )}
        {step === "protect" && (
          <ProtectedItemsEditor
            items={v.protectedItems}
            onChange={(protectedItems) => set({ ...v, protectedItems })}
            onError={setError}
          />
        )}
        <ErrorNotice error={error ?? state.error} />
        {statement.modal}
      </OnboardingFrame>
    </KeyboardAvoidingView>
  );
}
function Done() {
  const { data, error, loading, retry } = useResource<Today>("/budget/today");
  return (
    <OnboardingFrame
      step={steps.length}
      total={steps.length}
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
