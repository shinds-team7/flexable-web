import { useRef, useState } from "react";
import { Button, Card, ConfirmModal, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { goBack } from "@/real/components/SubHeader";
import { api } from "./api/client";
import { CategoryPicker } from "./CategoryPicker";
import { DateField } from "./DateField";
import { validDate } from "./occurredAt";
import { scheduledInputError } from "./scheduledInput";
import { useSession } from "./Session";
import { useServerExtensions } from "./serverExtensions";
import type { Category, ScheduledExpense } from "./types";
import {
  ErrorNotice,
  Field,
  Loading,
  MoneyField,
  Page,
  useResource,
} from "./ui";

const TITLE = "예정 지출 상세";

/**
 * 이미 등록한 예정 지출 한 건의 상세. 내역 목록의 "예정" 줄이나 등록 화면의 [수정]으로 들어오고,
 * 저장된 금액·내용·날짜·카테고리를 그대로 채워 보여 준 뒤 수정·삭제만 한다(새 등록은 /scheduled-expenses).
 * 단건 조회 API가 없어 그 날짜의 예정 목록(GET /scheduled-expenses?from=&to=)에서 찾는다.
 */
export function ScheduledExpenseDetailScreen({
  id,
  date,
}: {
  id?: string;
  date?: string;
}) {
  const extensions = useServerExtensions();
  const day = date && validDate(date) ? date : null;
  const result = useResource<{ items: ScheduledExpense[] }>(
    extensions.available && day
      ? `/scheduled-expenses?from=${day}&to=${day}`
      : null,
  );
  const item = result.data?.items.find((x) => String(x.id) === id);
  if (extensions.checking || (result.loading && !result.data))
    return <Loading />;
  if (!extensions.available || !day || result.error || !item)
    return (
      <Page title={TITLE}>
        {result.error ? (
          <ErrorNotice error={result.error} retry={result.retry} />
        ) : (
          <T>예정 지출을 찾지 못했어요. 이미 삭제되었을 수 있어요</T>
        )}
      </Page>
    );
  return <Detail key={item.id} item={item} />;
}

function Detail({ item }: { item: ScheduledExpense }) {
  const [amount, setAmount] = useState(item.amount);
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.date);
  const [categoryId, setCategoryId] = useState<number | null>(item.categoryId);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const session = useSession();
  const toast = useToast();
  const categories = useResource<Category[]>("/categories?type=EXPENSE");
  const selectedCategory = categories.data?.some((c) => c.id === categoryId)
    ? categoryId
    : (categories.data?.[0]?.id ?? null);
  const run = async (action: () => Promise<void>, message: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      session.invalidate();
      toast(message);
      goBack("/transactions");
    } catch (e) {
      setError(e);
      lock.current = false;
      setBusy(false);
    }
  };
  const save = () => {
    const invalid = scheduledInputError(
      { amount, title, date, categoryId: selectedCategory },
      item.date,
    );
    if (invalid) {
      setError(invalid);
      return;
    }
    void run(
      () =>
        api(`/scheduled-expenses/${item.id}`, {
          method: "PUT",
          body: {
            amount,
            categoryId: selectedCategory,
            title: title.trim(),
            date,
          },
        }).then(() => undefined),
      "예정 지출을 수정했어요",
    );
  };
  return (
    <Page title={TITLE}>
      <Card style={{ gap: 12 }}>
        <MoneyField
          label="예정 금액 (원)"
          value={amount}
          onChange={setAmount}
        />
        <Field
          label="예정 지출 내용"
          value={title}
          onChangeText={setTitle}
          maxLength={40}
          placeholder="예: 친구 생일 선물"
        />
        <DateField label="예정 날짜" value={date} onChange={setDate} />
        <T size={14} weight="700">
          카테고리
        </T>
        <ErrorNotice error={categories.error} retry={categories.retry} />
        <CategoryPicker
          list={categories.data ?? []}
          selected={selectedCategory}
          onSelect={setCategoryId}
          disabled={busy}
        />
        <ErrorNotice error={error} />
        <Button
          label={busy ? "저장 중이에요" : "예정 지출 수정"}
          disabled={busy || !amount || !selectedCategory || !title.trim()}
          onPress={save}
        />
        <Button
          label="예정 지출 삭제"
          variant="neutral"
          style={{ backgroundColor: "#D9DEE7" }}
          disabled={busy}
          onPress={() => setConfirm(true)}
        />
      </Card>
      <ConfirmModal
        visible={confirm}
        title="지출 예정을 삭제할까요?"
        message="이 예정 기록만 지워져요. 실제로 기록한 거래는 그대로예요"
        confirmLabel="삭제"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void run(
            () =>
              api(`/scheduled-expenses/${item.id}`, {
                method: "DELETE",
              }).then(() => undefined),
            "예정 지출을 삭제했어요",
          );
        }}
      />
    </Page>
  );
}
