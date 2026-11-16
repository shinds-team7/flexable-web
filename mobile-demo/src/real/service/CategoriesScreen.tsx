import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Button, Card, ConfirmModal, Segment, T } from "@/real/components/ui";
import { colors } from "@/real/theme";
import { api } from "./api/client";
import { CategorySheet } from "./CategorySheet";
import { useSession } from "./Session";
import { CategoryIcon, ErrorNotice, Loading, Page, useResource } from "./ui";
import type { Category, Kind } from "./types";
import { useServerExtensions } from "./serverExtensions";

export function CategoriesScreen() {
  const [type, setType] = useState<Kind>("EXPENSE");
  const [sheet, setSheet] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [editing, setEditing] = useState<Category | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const [local, setLocal] = useState<{ type: Kind; items: Category[] }>();
  const [drag, setDrag] = useState<{
    id: number;
    dy: number;
    target: number;
  }>();
  const heights = useRef(new Map<number, number>());
  const session = useSession();
  const extensions = useServerExtensions();
  const result = useResource<Category[]>(`/categories?type=${type}`);
  const items = local?.type === type ? local.items : result.data;
  useFocusEffect(
    useCallback(() => {
      setLocal(undefined);
    }, []),
  );

  const saveOrder = async (from: number, to: number) => {
    setDrag(undefined);
    if (
      lock.current ||
      !items ||
      !extensions.available ||
      from === to ||
      to < 0 ||
      to >= items.length
    )
      return;
    const previous = items;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setLocal({ type, items: next });
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
      setLocal({ type, items: previous });
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const targetFor = (index: number, dy: number) => {
    if (!items) return index;
    let y = 0;
    const centers = items.map((c) => {
      const h = heights.current.get(c.id) ?? 76;
      const center = y + h / 2;
      y += h + 12;
      return center;
    });
    const position = centers[index] + dy;
    return centers.reduce(
      (best, value, i) =>
        Math.abs(value - position) < Math.abs(centers[best] - position)
          ? i
          : best,
      index,
    );
  };
  const openSheet = (category: Category | null) => {
    setEditing(category);
    setSheetKey((n) => n + 1);
    setSheet(true);
  };
  const remove = async () => {
    if (
      !selected ||
      !items ||
      lock.current ||
      (selected.isDefault && !extensions.available)
    )
      return;
    const previous = items;
    const id = selected.id;
    setSelected(null);
    setLocal({ type, items: items.filter((c) => c.id !== id) });
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/categories/${id}`, { method: "DELETE" });
      const fresh = await api<Category[]>(`/categories?type=${type}`);
      setLocal({ type, items: fresh });
      session.invalidate();
    } catch (e) {
      setLocal({ type, items: previous });
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
        onChange={(value) => {
          if (!lock.current) {
            setType(value);
            setLocal(undefined);
            setDrag(undefined);
          }
        }}
      />
      <ErrorNotice error={error} />
      <ErrorNotice error={result.error} retry={result.retry} />
      {!items && result.loading ? (
        <Loading />
      ) : (
        <View style={{ gap: 12 }}>
          {items?.map((c, index) => (
            <View
              key={c.id}
              onLayout={(e) =>
                heights.current.set(c.id, e.nativeEvent.layout.height)
              }
              style={{ zIndex: drag?.id === c.id ? 2 : 0 }}
            >
              <Card
                style={[
                  styles.row,
                  drag?.id === c.id && {
                    transform: [{ translateY: drag.dy }],
                    borderColor: colors.brand,
                  },
                  drag?.target === index &&
                    drag.id !== c.id && { backgroundColor: colors.brandSoft },
                ]}
              >
                <CategoryIcon icon={c.icon} color={c.color} />
                <View style={{ flex: 1 }}>
                  <T weight="600" numberOfLines={1}>
                    {c.name}
                  </T>
                  {c.isDefault && (
                    <T size={12} color={colors.textMuted}>
                      기본 카테고리
                    </T>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name} 수정`}
                  disabled={busy || !!drag}
                  onPress={() => openSheet(c)}
                  style={styles.action}
                >
                  <Ionicons
                    name="create-outline"
                    size={21}
                    color={colors.textSub}
                  />
                </Pressable>
                {(extensions.available || !c.isDefault) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name} 삭제`}
                    disabled={busy || !!drag}
                    onPress={() => setSelected(c)}
                    style={styles.action}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={21}
                      color={colors.danger}
                    />
                  </Pressable>
                )}
                {extensions.available && (
                  <DragHandle
                    name={c.name}
                    disabled={busy}
                    onMove={(dy) =>
                      setDrag({ id: c.id, dy, target: targetFor(index, dy) })
                    }
                    onDrop={(dy) => void saveOrder(index, targetFor(index, dy))}
                    onCancel={() => setDrag(undefined)}
                    onStep={(step) => void saveOrder(index, index + step)}
                  />
                )}
              </Card>
            </View>
          ))}
        </View>
      )}
      <Button
        label="+ 카테고리 추가"
        disabled={busy || !!drag}
        onPress={() => openSheet(null)}
      />
      <CategorySheet
        resetKey={sheetKey}
        visible={sheet}
        category={editing}
        onClose={() => setSheet(false)}
        type={type}
        onCreated={(saved) => {
          const next = editing
            ? items?.map((c) => (c.id === saved.id ? saved : c))
            : [...(items ?? []), saved];
          setLocal({ type, items: next ?? [saved] });
        }}
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

function DragHandle(props: {
  name: string;
  disabled: boolean;
  onMove: (dy: number) => void;
  onDrop: (dy: number) => void;
  onCancel: () => void;
  onStep: (step: number) => void;
}) {
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  // 콜백은 터치 이벤트에서만 ref를 읽는다. 기존 SwipeToDelete와 같은 안정된 responder 패턴이다.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderGrant: () => latest.current.onMove(0),
      onPanResponderMove: (_e, state) => latest.current.onMove(state.dy),
      onPanResponderRelease: (_e, state) => latest.current.onDrop(state.dy),
      onPanResponderTerminate: () => latest.current.onCancel(),
      onPanResponderTerminationRequest: () => false,
    }),
  );
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${props.name} 순서 변경`}
      accessibilityHint="위아래로 끌어서 순서를 바꿔요"
      accessibilityState={{ disabled: props.disabled }}
      accessibilityActions={[
        { name: "increment", label: "아래로 이동" },
        { name: "decrement", label: "위로 이동" },
      ]}
      onAccessibilityAction={(e) => {
        if (!props.disabled)
          props.onStep(e.nativeEvent.actionName === "increment" ? 1 : -1);
      }}
      style={[styles.action, { touchAction: "none" } as object]}
    >
      <Ionicons
        name="reorder-three-outline"
        size={25}
        color={colors.textMuted}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 12,
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.line,
  },
  action: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
