import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, ConfirmModal, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { api } from "./api/client";
import { DateField } from "./DateField";
import { CategorySheet } from "./CategorySheet";
import { validDate } from "./occurredAt";
import { useSession } from "./Session";
import { useServerExtensions } from "./serverExtensions";
import type { Category, ScheduledExpense } from "./types";
import {
  ErrorNotice,
  Field,
  Loading,
  MoneyField,
  Page,
  money,
  seoulDate,
  useResource,
} from "./ui";

const tomorrow = () =>
  new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
export function ScheduledExpensesScreen() {
  const extensions = useServerExtensions();
  const params = useLocalSearchParams<{ date?: string }>();
  const initial =
    params.date && validDate(params.date) ? params.date : tomorrow();
  if (!extensions.available)
    return (
      <Page title="지출 예정 등록">
        {extensions.checking ? (
          <Loading />
        ) : (
          <T>
            지출 예정 기능을 준비하고 있어요. 현재는 거래 기록을 이용해 주세요
          </T>
        )}
      </Page>
    );
  return <ScheduledForm key={initial} initial={initial} />;
}
function ScheduledForm({ initial }: { initial: string }) {
  const [activeDate, setActiveDate] = useState(initial);
  const [date, setDate] = useState(initial);
  const [amount, setAmount] = useState(0);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ScheduledExpense | null>(null);
  const [remove, setRemove] = useState<ScheduledExpense | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const session = useSession();
  const toast = useToast();
  const categories = useResource<Category[]>("/categories?type=EXPENSE");
  const result = useResource<{ items: ScheduledExpense[] }>(
    `/scheduled-expenses?from=${activeDate}&to=${activeDate}`,
  );
  const selectedCategory = categories.data?.some((c) => c.id === categoryId)
    ? categoryId
    : (categories.data?.[0]?.id ?? null);
  const clear = () => {
    setEditing(null);
    setAmount(0);
    setTitle("");
    setDate(activeDate);
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      session.invalidate();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = () => {
    if (
      !selectedCategory ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount >= 1e12 ||
      !title.trim() ||
      title.trim().length > 40 ||
      !validDate(date)
    ) {
      setError("금액·카테고리·내용·날짜를 확인해 주세요");
      return;
    }
    if (date <= seoulDate() && date !== editing?.date) {
      setError("내일부터의 날짜를 선택해 주세요");
      return;
    }
    void run(async () => {
      await api(
        editing ? `/scheduled-expenses/${editing.id}` : "/scheduled-expenses",
        {
          method: editing ? "PUT" : "POST",
          body: {
            amount,
            categoryId: selectedCategory,
            title: title.trim(),
            date,
          },
        },
      );
      setActiveDate(date);
      setEditing(null);
      setAmount(0);
      setTitle("");
      toast("지출 예정을 저장했어요");
    });
  };
  return (
    <Page title="지출 예정 등록">
      <Card style={{ gap: 12 }}>
        <T weight="700">{editing ? "지출 예정 수정" : "미리 기록해 둘 지출"}</T>
        <T size={13}>
          예정 지출은 실제 거래와 별도로 보관해요. 날짜가 되어도 예산에서
          자동으로 빼지 않아요. 실제로 쓴 돈은 지출로 직접 기록해 주세요
        </T>
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {categories.data?.map((c) => (
            <Button
              key={c.id}
              label={c.name}
              variant={selectedCategory === c.id ? "primary" : "soft"}
              accessibilityState={{ selected: selectedCategory === c.id }}
              disabled={busy}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
          <Button
            label="+ 카테고리 추가"
            variant="ghost"
            onPress={() => setAddingCategory(true)}
          />
        </View>
        <ErrorNotice error={error} />
        <Button
          label={
            busy
              ? "저장 중이에요"
              : editing
                ? "예정 지출 수정"
                : "예정 지출 등록"
          }
          disabled={busy || !amount || !selectedCategory || !title.trim()}
          onPress={save}
        />
        {editing && (
          <Button
            label="수정 취소"
            variant="ghost"
            disabled={busy}
            onPress={clear}
          />
        )}
      </Card>
      <T size={18} weight="700">
        {activeDate} 지출 예정
      </T>
      <ErrorNotice error={result.error} retry={result.retry} />
      {result.loading && <Loading />}
      {!result.loading && result.data?.items.length === 0 && (
        <T>등록한 지출 예정이 없어요</T>
      )}
      {!result.loading &&
        result.data?.items.map((item) => (
          <Card key={item.id} style={{ gap: 8 }}>
            <T weight="700">{item.title}</T>
            <T>
              {money(item.amount)}원 · {item.category?.name ?? "카테고리 없음"}
            </T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label={`${item.title} 수정`}
                variant="soft"
                disabled={busy}
                onPress={() => {
                  setEditing(item);
                  setAmount(item.amount);
                  setTitle(item.title);
                  setDate(item.date);
                  setCategoryId(item.categoryId);
                }}
              />
              <Button
                label={`${item.title} 삭제`}
                variant="ghost"
                disabled={busy}
                onPress={() => setRemove(item)}
              />
            </View>
          </Card>
        ))}
      <CategorySheet
        visible={addingCategory}
        onClose={() => setAddingCategory(false)}
        type="EXPENSE"
        onCreated={() => categories.retry()}
      />
      <ConfirmModal
        visible={!!remove}
        title="지출 예정을 삭제할까요?"
        message="이 예정 기록만 지워져요. 실제로 기록한 거래는 그대로예요"
        confirmLabel="삭제"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          const item = remove;
          setRemove(null);
          if (item)
            void run(async () => {
              await api(`/scheduled-expenses/${item.id}`, { method: "DELETE" });
              if (editing?.id === item.id) clear();
            });
        }}
      />
    </Page>
  );
}
