import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "./uuid";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Card, Segment, Sheet, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { goBack } from "@/real/components/SubHeader";
import { colors, radius } from "@/real/theme";
import { api } from "./api/client";
import { DateField } from "./DateField";
import { occurredAtFor, seoulDateOf, validDate } from "./occurredAt";
import { guessCategoryName } from "./receiptImport/guessCategory";
import { REVIEW_TYPE, type ImportCandidate } from "./receiptImport/parse";
import { dateRange, dupKey } from "./receiptImport/review";
import { clearPending, getPending } from "./receiptImport/store";
import { useSession } from "./Session";
import {
  CategoryIcon,
  digits,
  ErrorNotice,
  Field,
  Loading,
  money,
  Page,
  useResource,
} from "./ui";
import type { Category, Kind, Transaction } from "./types";

type Row = {
  id: string;
  /** 저장 요청마다 하나. 응답을 못 받았을 때 같은 키로 다시 보내 중복 저장을 막는다 */
  key: string;
  /** 사용자가 직접 고른 값. 없으면 확인할 것이 없고 이미 기록된 거래가 아닐 때만 켜진다 */
  picked: boolean | null;
  title: string;
  amount: string;
  type: Kind | null;
  date: string;
  categoryId: number | null;
  guess: string;
  ownTransfer: boolean;
  refund: boolean;
  review: string[];
  editing: boolean;
  status: "idle" | "saved" | "uncertain" | "error";
  message?: string;
  /** 첫 시도에 보낸 본문. 저장 여부를 모를 때는 이 본문 그대로 다시 보낸다 */
  body?: Record<string, unknown>;
};

const toRow = (c: ImportCandidate): Row => ({
  id: randomUUID(),
  key: randomUUID(),
  picked: null,
  title: c.title.slice(0, 40),
  amount: String(c.amount),
  type: c.type,
  date: c.date,
  categoryId: null,
  guess: c.type ? guessCategoryName(c.title, c.type) : "",
  ownTransfer: c.ownTransfer,
  refund: c.refund,
  review: c.review,
  editing: false,
  status: "idle",
});

const frozen = (r: Row) => r.status === "saved" || r.status === "uncertain";
const amountOk = (r: Row) =>
  Number.isInteger(Number(r.amount)) &&
  Number(r.amount) >= 1 &&
  Number(r.amount) < 1e12;

export function ImportReview() {
  const [initial] = useState(() => getPending());
  if (!initial || initial.length === 0)
    return (
      <Page title="가져온 거래 확인">
        <T>가져온 거래가 없어요. 거래내역에서 이미지를 다시 골라 주세요</T>
        <Button label="돌아가기" onPress={() => goBack("/transactions")} />
      </Page>
    );
  return <Review initial={initial} />;
}

function Review({ initial }: { initial: ImportCandidate[] }) {
  const session = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow));
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const expense = useResource<Category[]>("/categories?type=EXPENSE");
  const income = useResource<Category[]>("/categories?type=INCOME");
  const range = useMemo(() => dateRange(rows.map((r) => r.date)), [rows]);
  const existing = useResource<{ items: Transaction[] }>(
    range ? `/transactions?from=${range.from}&to=${range.to}` : null,
  );
  // 이미 기록된 거래일 수 있는 항목은 기본으로 빼 두되, 다시 고를 수 있다.
  const known = useMemo(
    () =>
      new Set(
        (existing.data?.items ?? []).map((t) =>
          dupKey(seoulDateOf(t.occurredAt) ?? "", t.type, t.amount, t.title),
        ),
      ),
    [existing.data],
  );
  const isDup = (r: Row) =>
    !!r.type && known.has(dupKey(r.date, r.type, Number(r.amount), r.title));
  const isOn = (r: Row) => r.picked ?? (r.review.length === 0 && !isDup(r));
  const listOf = (type: Kind | null) =>
    (type === "INCOME"
      ? income.data
      : type === "EXPENSE"
        ? expense.data
        : []) ?? [];
  const categoryOf = (r: Row): Category | undefined => {
    const list = listOf(r.type);
    return (
      list.find((c) => c.id === r.categoryId) ??
      list.find((c) => c.name === r.guess) ??
      list[list.length - 1]
    );
  };
  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  // 입금인지 출금인지 고르면 그 확인 요청은 풀린다.
  const chooseType = (r: Row, type: Kind) =>
    patch(r.id, {
      type,
      categoryId: null,
      guess: guessCategoryName(r.title, type),
      review: r.review.filter((m) => m !== REVIEW_TYPE),
    });
  const loading = expense.loading || income.loading || existing.loading;
  const loadError =
    expense.error ??
    income.error ??
    existing.error ??
    (!range
      ? "거래 날짜를 확인해 주세요. 한 번에 366일 안의 거래를 가져올 수 있어요"
      : undefined);
  const targets = rows.filter((r) => isOn(r) && r.status !== "saved");
  const savedCount = rows.filter((r) => r.status === "saved").length;
  const problem = (r: Row) =>
    r.review.length > 0 ||
    !r.type ||
    !amountOk(r) ||
    !validDate(r.date) ||
    !categoryOf(r);

  const save = async () => {
    if (lock.current || loading || loadError) return;
    if (targets.some(problem)) {
      setError("확인이 필요한 항목이 있어요. 표시된 항목을 확인해 주세요");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    let failed = 0;
    // 순서대로 보낸다. 응답을 못 받은 항목은 같은 본문·같은 키로만 다시 보낸다.
    for (const r of targets) {
      const body = r.body ?? {
        type: r.type,
        amount: Number(r.amount),
        categoryId: categoryOf(r)!.id,
        title: r.title.trim() || categoryOf(r)!.name,
        memo: "",
        occurredAt: occurredAtFor(r.date, undefined, new Date()),
      };
      try {
        await api("/transactions", { method: "POST", body, key: r.key });
        patch(r.id, { status: "saved", body, message: undefined });
      } catch (e) {
        failed++;
        const uncertain =
          e instanceof Error &&
          "code" in e &&
          (e.code === "NETWORK" || e.code === "INTERNAL_ERROR");
        patch(
          r.id,
          uncertain
            ? {
                status: "uncertain",
                picked: true,
                body,
                message:
                  "저장됐는지 확인하지 못했어요. 다시 시도하면 같은 내용으로 확인해요",
              }
            : {
                status: "error",
                body: undefined,
                message: e instanceof Error ? e.message : "저장하지 못했어요",
              },
        );
      }
    }
    session.invalidate();
    if (failed === 0) {
      clearPending();
      toast(`${targets.length}건을 기록했어요`, undefined, "top");
      goBack("/transactions");
    } else {
      lock.current = false;
      setBusy(false);
      setError(`${failed}건을 저장하지 못했어요. 표시된 항목을 확인해 주세요`);
    }
  };

  const label = busy
    ? "처리 중…"
    : targets.length === 0
      ? "가져올 거래를 골라 주세요"
      : error
        ? "다시 시도"
        : `${targets.length}건 기록하기`;
  return (
    <Page
      title="가져온 거래 확인"
      footer={
        <Button
          label={label}
          disabled={busy || loading || !!loadError || targets.length === 0}
          onPress={save}
        />
      }
    >
      <T size={13}>
        사진에서 읽은 내용이에요. 틀린 곳은 고치고, 기록할 거래만 골라 주세요.
        날짜만 읽을 수 있어서 시각은 기록하지 않아요
      </T>
      {savedCount > 0 && <T size={13}>{savedCount}건은 이미 기록했어요</T>}
      <ErrorNotice
        error={loadError}
        retry={
          range
            ? () => {
                expense.retry();
                income.retry();
                existing.retry();
              }
            : undefined
        }
      />
      {loading && <Loading />}
      {rows.map((r) => {
        const cat = categoryOf(r);
        const locked = busy || frozen(r);
        return (
          <Card
            key={r.id}
            style={{ gap: 10, opacity: r.status === "saved" ? 0.5 : 1 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`${r.title} 기록하기`}
                accessibilityState={{ checked: isOn(r), disabled: locked }}
                disabled={locked}
                onPress={() => patch(r.id, { picked: !isOn(r) })}
              >
                <Ionicons
                  name={
                    isOn(r) || r.status === "saved"
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={26}
                  color={isOn(r) ? colors.brand : colors.textMuted}
                />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700" numberOfLines={1}>
                  {r.title}
                </T>
                <T size={12} color={colors.textMuted}>
                  {r.date.replace(/-/g, ". ")}
                </T>
              </View>
              <T
                weight="700"
                color={r.type === "INCOME" ? colors.brand : colors.text}
              >
                {r.type === "INCOME" ? "+" : r.type === "EXPENSE" ? "-" : ""}
                {money(Number(r.amount) || 0)}원
              </T>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {r.ownTransfer && <Badge text="내 계좌 간 이체일 수 있어요" />}
              {r.refund && <Badge text="취소·환불" />}
              {isDup(r) && <Badge text="이미 기록된 거래일 수 있어요" />}
              {r.status === "saved" && <Badge text="기록했어요" />}
            </View>
            {r.review.map((m) => (
              <T key={m} size={13} color={colors.danger}>
                {m}
              </T>
            ))}
            {!r.type && !locked && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label="출금이에요"
                  variant="soft"
                  style={{ flex: 1 }}
                  onPress={() => chooseType(r, "EXPENSE")}
                />
                <Button
                  label="입금이에요"
                  variant="soft"
                  style={{ flex: 1 }}
                  onPress={() => chooseType(r, "INCOME")}
                />
              </View>
            )}
            {r.type && r.review.length > 0 && !locked && (
              <Button
                label="확인했어요"
                variant="soft"
                onPress={() => patch(r.id, { review: [], picked: true })}
              />
            )}
            {r.message && (
              <T size={13} color={colors.danger}>
                {r.message}
              </T>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${r.title} 카테고리 ${cat?.name ?? "고르기"}`}
                disabled={locked || !r.type}
                onPress={() => setPicking(r.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: radius.soft,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                {cat && <CategoryIcon icon={cat.icon} color={cat.color} />}
                <T size={13}>{cat?.name ?? "카테고리 고르기"}</T>
              </Pressable>
              <Button
                label={r.editing ? "접기" : "수정"}
                variant="ghost"
                disabled={locked}
                onPress={() => patch(r.id, { editing: !r.editing })}
              />
            </View>
            {r.editing && !locked && (
              <View style={{ gap: 12 }}>
                <Segment
                  items={[
                    { key: "EXPENSE", label: "지출" },
                    { key: "INCOME", label: "수입" },
                  ]}
                  value={r.type ?? "EXPENSE"}
                  onChange={(type) => chooseType(r, type)}
                />
                <Field
                  label="내용"
                  value={r.title}
                  maxLength={40}
                  onChangeText={(title) => patch(r.id, { title })}
                />
                <Field
                  label="금액"
                  value={r.amount ? money(Number(r.amount)) : ""}
                  keyboardType="number-pad"
                  onChangeText={(s) => patch(r.id, { amount: digits(s) })}
                />
                <DateField
                  label="날짜"
                  value={r.date}
                  onChange={(date) => patch(r.id, { date })}
                />
              </View>
            )}
          </Card>
        );
      })}
      <ErrorNotice error={error} />
      <Sheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title="카테고리"
      >
        <ScrollView style={{ maxHeight: 360 }}>
          {listOf(rows.find((r) => r.id === picking)?.type ?? null).map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              onPress={() => {
                if (picking) patch(picking, { categoryId: c.id });
                setPicking(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
              }}
            >
              <CategoryIcon icon={c.icon} color={c.color} />
              <T>{c.name}</T>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </Page>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: colors.brandSoft,
      }}
    >
      <T size={12} color={colors.brandDark}>
        {text}
      </T>
    </View>
  );
}
