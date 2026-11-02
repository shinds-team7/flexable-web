import { randomUUID } from "./uuid";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, ConfirmModal, Segment, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import { goBack } from "@/real/components/SubHeader";
import { colors, radius } from "@/real/theme";
import { api } from "./api/client";
import { CategorySheet } from "./CategorySheet";
import { DateField } from "./DateField";
import { occurredAtFor, validDate } from "./occurredAt";
import { useSession } from "./Session";
import {
  CategoryIcon,
  digits,
  ErrorNotice,
  Field,
  Loading,
  money,
  Page,
  seoulDate,
  toSeoulInput,
  useResource,
} from "./ui";
import type { Category, Kind, Transaction } from "./types";
export function TransactionForm({ id }: { id?: string }) {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const initialDate =
    date && validDate(date) && date <= seoulDate() ? date : undefined;
  const loaded = useResource<Transaction>(id ? `/transactions/${id}` : null);
  if (id && loaded.loading && !loaded.data) return <Loading />;
  if (id && loaded.error)
    return (
      <Page title="거래 상세">
        <ErrorNotice error={loaded.error} retry={loaded.retry} />
      </Page>
    );
  return (
    <Form
      key={id ?? `new:${initialDate ?? "today"}`}
      existing={loaded.data}
      initialDate={initialDate}
    />
  );
}
function Form({
  existing,
  initialDate,
}: {
  existing?: Transaction;
  initialDate?: string;
}) {
  const session = useSession();
  const toast = useToast();
  const [type, setType] = useState<Kind>(existing?.type ?? "EXPENSE");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState<number | null>(
    existing?.categoryId ?? null,
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  // The form no longer edits memos; an existing one is sent back unchanged.
  const memo = existing?.memo ?? "";
  // Only the day is picked; occurredAtFor() decides the time sent to the server.
  const [date, setDate] = useState(() =>
    existing
      ? toSeoulInput(existing.occurredAt).slice(0, 10)
      : (initialDate ?? seoulDate()),
  );
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>();
  const [errorAction, setErrorAction] = useState<"save" | "delete">("save");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  const pending = useRef<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const categories = useResource<Category[]>(`/categories?type=${type}`);
  const [added, setAdded] = useState<Category[]>([]);
  const list = [
    ...(categories.data ?? []),
    ...added.filter(
      (c) => c.type === type && !categories.data?.some((x) => x.id === c.id),
    ),
  ];
  // Unlock only on failure: on success the screen is popping, and re-rendering it mid-transition
  // (busy → false) is what left Android on a blank native window.
  const unlock = () => {
    lock.current = false;
    setBusy(false);
  };
  const done = (message: string) => {
    session.invalidate();
    toast(message, undefined, "top");
    goBack("/transactions");
  };
  const save = async () => {
    if (lock.current) return;
    setErrorAction("save");
    if (
      !uncertain &&
      (!Number.isInteger(Number(amount)) ||
        Number(amount) < 1 ||
        Number(amount) >= 1e12)
    ) {
      setError("금액은 1원 이상, 1조 미만으로 입력해 주세요");
      return;
    }
    if (
      !uncertain &&
      (!categoryId ||
        title.trim().length > 40 ||
        memo.length > 200 ||
        !validDate(date))
    ) {
      setError("카테고리와 날짜를 확인해 주세요");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    if (!key.current) key.current = randomUUID();
    const body = pending.current ?? {
      type,
      amount: Number(amount),
      categoryId,
      // The server needs a title; an empty one falls back to the category name.
      title:
        title.trim() ||
        list.find((c) => c.id === categoryId)?.name ||
        (type === "INCOME" ? "수입" : "지출"),
      memo,
      occurredAt: occurredAtFor(date, existing?.occurredAt, new Date()),
    };
    pending.current = body;
    try {
      await api(existing ? `/transactions/${existing.id}` : "/transactions", {
        method: existing ? "PATCH" : "POST",
        body,
        key: existing ? undefined : key.current,
      });
      done(existing ? "거래를 수정했어요" : "거래를 기록했어요");
    } catch (e) {
      setError(e);
      if (
        !existing &&
        e instanceof Error &&
        "code" in e &&
        (e.code === "NETWORK" || e.code === "INTERNAL_ERROR")
      )
        setUncertain(true);
      else {
        pending.current = null;
        setUncertain(false);
      }
      unlock();
    }
  };
  const remove = async () => {
    if (!existing || lock.current) return;
    setConfirm(false);
    setErrorAction("delete");
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/transactions/${existing.id}`, { method: "DELETE" });
      done("거래를 삭제했어요");
    } catch (e) {
      setError(e);
      unlock();
    }
  };
  const expense = type === "EXPENSE";
  return (
    <Page
      title={existing ? "거래 상세" : "거래 직접 기록"}
      footer={
        <Button
          label={
            busy
              ? "처리 중…"
              : error && errorAction === "save"
                ? "다시 시도"
                : !amount && !uncertain
                  ? "금액을 입력해 주세요"
                  : existing
                    ? "저장하기"
                    : "기록하기"
          }
          disabled={busy || (!amount && !uncertain)}
          onPress={save}
        />
      }
    >
      {/* Keep a real native view: toggling pointerEvents would otherwise flatten/unflatten it and
          reparent the fields while the screen pops, which crashed Android (addViewAt: already has a parent). */}
      <View
        collapsable={false}
        pointerEvents={busy || uncertain ? "none" : "auto"}
        style={{ gap: 12 }}
      >
        <Segment
          items={[
            { key: "EXPENSE", label: "지출" },
            { key: "INCOME", label: "수입" },
          ]}
          value={type}
          onChange={(next) => {
            setType(next);
            setCategoryId(null);
          }}
        />
        <Field
          editable={!busy && !uncertain}
          label="금액"
          hideLabel
          placeholder="금액 입력"
          value={amount ? money(Number(amount)) : ""}
          keyboardType="number-pad"
          onChangeText={(s) => setAmount(digits(s))}
          style={{ minHeight: 64, fontSize: 20, fontWeight: "700" }}
          right={
            <T
              size={20}
              weight="700"
              color={colors.textSub}
              style={{ paddingRight: 10 }}
            >
              원
            </T>
          }
        />
        <T size={14} weight="700" color={colors.textSub}>
          카테고리
        </T>
        {categories.loading && <Loading />}
        <ErrorNotice error={categories.error} retry={categories.retry} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {list.map((c) => (
            <Pressable
              key={c.id}
              disabled={busy || uncertain}
              accessibilityRole="radio"
              accessibilityLabel={c.name}
              accessibilityState={{ checked: categoryId === c.id }}
              aria-checked={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
              style={{
                width: "30%",
                padding: 12,
                gap: 6,
                alignItems: "center",
                borderRadius: radius.soft,
                backgroundColor:
                  categoryId === c.id ? colors.brandSoft : "#fff",
                borderWidth: 1,
                borderColor: categoryId === c.id ? colors.brand : colors.line,
              }}
            >
              <CategoryIcon icon={c.icon} color={c.color} />
              <T size={13} style={{ textAlign: "center" }}>
                {c.name}
              </T>
            </Pressable>
          ))}
          <Button
            label="+ 추가"
            variant="soft"
            style={{ width: "30%" }}
            onPress={() => setSheet(true)}
          />
        </View>
        <Field
          editable={!busy && !uncertain}
          label={expense ? "어디에 썼나요?" : "어디서 받았나요?"}
          placeholder={expense ? "예: 점심 김밥" : "예: 10월 급여"}
          help="비워 두면 카테고리 이름으로 기록해요"
          value={title}
          onChangeText={setTitle}
          maxLength={40}
        />
        <DateField label="날짜" value={date} onChange={setDate} />
      </View>
      {uncertain && (
        <T>저장 여부를 확인하지 못했어요. 같은 내용으로 다시 확인할게요</T>
      )}
      <ErrorNotice error={error} />
      {existing && (
        <Button
          label={
            error && errorAction === "delete"
              ? "거래 삭제 다시 시도"
              : "거래 삭제"
          }
          variant="ghost"
          disabled={busy}
          onPress={() => setConfirm(true)}
        />
      )}
      <CategorySheet
        visible={sheet}
        onClose={() => setSheet(false)}
        type={type}
        onCreated={(c) => {
          setAdded((x) => [...x, c]);
          setCategoryId(c.id);
        }}
      />
      <ConfirmModal
        visible={confirm}
        title="거래를 삭제할까요?"
        message="삭제한 거래는 되돌릴 수 없어요. 예산에도 바로 반영돼요"
        confirmLabel="삭제"
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </Page>
  );
}
