import { useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, ConfirmModal, Segment, T } from "@/real/components/ui";
import { api } from "./api/client";
import { CategorySheet } from "./CategorySheet";
import { useSession } from "./Session";
import { CategoryIcon, ErrorNotice, Loading, Page, useResource } from "./ui";
import type { Category, Kind } from "./types";
import { useServerExtensions } from "./serverExtensions";
export function CategoriesScreen() {
  const [type, setType] = useState<Kind>("EXPENSE");
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const session = useSession();
  const extensions = useServerExtensions();
  const result = useResource<Category[]>(`/categories?type=${type}`);
  const move = async (index: number, step: number) => {
    if (lock.current || !result.data || !extensions.available) return;
    const next = [...result.data];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api("/categories/order", {
        method: "PUT",
        body: { type, ids: next.map((c) => c.id) },
      });
      session.invalidate();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async () => {
    if (
      !selected ||
      lock.current ||
      (selected.isDefault && !extensions.available)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    const id = selected.id;
    setSelected(null);
    try {
      await api(`/categories/${id}`, { method: "DELETE" });
      session.invalidate();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Page title="카테고리 관리">
      <Segment
        items={[
          { key: "EXPENSE", label: "지출" },
          { key: "INCOME", label: "수입" },
        ]}
        value={type}
        onChange={setType}
      />
      <ErrorNotice error={error} />
      <ErrorNotice error={result.error} retry={result.retry} />
      {result.loading ? (
        <Loading />
      ) : (
        result.data?.map((c, index) => (
          <Card
            key={c.id}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <CategoryIcon icon={c.icon} color={c.color} />
            <View style={{ flex: 1 }}>
              <T weight="600">{c.name}</T>
              {c.isDefault && <T size={12}>기본 카테고리</T>}
            </View>
            {extensions.available && (
              <View style={{ gap: 2 }}>
                <Button
                  label="↑"
                  accessibilityLabel={`${c.name} 위로 이동`}
                  variant="ghost"
                  disabled={busy || index === 0}
                  onPress={() => move(index, -1)}
                  style={{ minHeight: 32, paddingVertical: 4 }}
                />
                <Button
                  label="↓"
                  accessibilityLabel={`${c.name} 아래로 이동`}
                  variant="ghost"
                  disabled={busy || index === result.data!.length - 1}
                  onPress={() => move(index, 1)}
                  style={{ minHeight: 32, paddingVertical: 4 }}
                />
              </View>
            )}
            {(extensions.available || !c.isDefault) && (
              <Button
                label="삭제"
                variant="ghost"
                disabled={busy}
                onPress={() => setSelected(c)}
              />
            )}
          </Card>
        ))
      )}
      <Button label="+ 카테고리 추가" onPress={() => setSheet(true)} />
      <CategorySheet
        visible={sheet}
        onClose={() => setSheet(false)}
        type={type}
        onCreated={() => result.retry()}
      />
      <ConfirmModal
        visible={!!selected}
        title="카테고리를 삭제할까요?"
        message="기록한 거래와 예정 지출은 같은 종류의 다른 카테고리로 옮겨져요. 옮길 곳이 없으면 '기타'를 새로 만들어요"
        confirmLabel="삭제"
        onCancel={() => setSelected(null)}
        onConfirm={remove}
      />
    </Page>
  );
}
