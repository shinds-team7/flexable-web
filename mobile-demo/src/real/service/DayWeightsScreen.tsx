import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Card, RadioMark, Row, styles as ui, T } from "@/real/components/ui";
import { DayWeightBars } from "@/real/components/DayWeightBars";
import { goBack, SubHeader } from "@/real/components/SubHeader";
import { useToast } from "@/real/components/Toast";
import { colors } from "@/real/theme";
import {
  PRESET_DETAIL,
  PRESET_LABEL,
  recordHint,
  sameWeights,
} from "@/real/utils/dayWeights";
import { api } from "./api/client";
import { useSession } from "./Session";
import type { DayPreset, DayWeights } from "./types";
import { ErrorNotice, Loading, seoulDate, useResource } from "./ui";

/**
 * 요일별 생활비 배분 바꾸기(GET·PUT /budget/day-weights). 프리셋을 고르고 막대를 위아래로 끌어 요일 비중을 정한다.
 * 금액은 저장한 뒤 서버가 다시 계산하고, 이 화면은 비중(%)만 보여 준다.
 */
export function DayWeightsScreen() {
  const res = useResource<DayWeights>("/budget/day-weights");
  const session = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<{
    preset: DayPreset;
    weights: number[];
  }>();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);

  const data = res.data;
  const today = (new Date(seoulDate() + "T12:00:00").getDay() + 6) % 7;
  const current =
    draft ?? (data && { preset: data.preset, weights: data.weights });
  const changed =
    !!data &&
    !!current &&
    (current.preset !== data.preset ||
      !sameWeights(current.weights, data.weights));

  const pick = (preset: DayPreset, weights: number[]) => {
    setError(undefined);
    setDraft({ preset, weights: [...weights] });
  };
  const drag = (index: number, weight: number) => {
    if (!data || !current || current.weights[index] === weight) return;
    const weights = current.weights.map((w, i) => (i === index ? weight : w));
    pick("CUSTOM", weights);
  };

  // Unlock only on failure: on success the screen is popping (docs/bug-transaction-edit-blank-screen.md).
  const save = async () => {
    if (lock.current || !current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api<DayWeights>("/budget/day-weights", {
        method: "PUT",
        body:
          current.preset === "CUSTOM"
            ? { preset: "CUSTOM", weights: current.weights }
            : { preset: current.preset },
      });
      session.invalidate();
      toast("요일별 배분을 바꿨어요", undefined, "top");
      goBack("/home");
    } catch (e) {
      lock.current = false;
      setBusy(false);
      setError(e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SubHeader title="요일별 생활비 배분" fallback="/home" />
      <ScrollView
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={ui.screen}
        showsVerticalScrollIndicator={false}
      >
        {res.loading && !data && <Loading />}
        <ErrorNotice error={res.error} retry={res.retry} />
        {data && current && (
          <>
            <Card style={{ paddingVertical: 8, paddingHorizontal: 0 }}>
              {data.presets.map((p, i) => {
                const available = p.weights != null;
                const on = current.preset === p.id;
                const id = p.id as Exclude<DayPreset, "CUSTOM">;
                return (
                  <Row
                    key={p.id}
                    first={i === 0}
                    label={PRESET_LABEL[p.id]}
                    caption={
                      p.id === "RECORD"
                        ? `${PRESET_DETAIL.RECORD} · ${recordHint(data.record, available)}`
                        : PRESET_DETAIL[id]
                    }
                    accessibilityRole="radio"
                    disabled={!available || busy}
                    accessibilityState={{ checked: on, disabled: !available || busy }}
                    aria-checked={on}
                    right={<RadioMark on={on} />}
                    onPress={() => p.weights && pick(p.id, p.weights)}
                  />
                );
              })}
            </Card>
            <Card style={{ gap: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <T size={16} weight="700" accessibilityRole="header">
                  요일 비중
                </T>
                <T size={13} weight="700" color={colors.brandDark}>
                  {PRESET_LABEL[current.preset]}
                </T>
              </View>
              <T size={13} color={colors.textMuted}>
                막대를 위아래로 끌어 요일마다 비중을 정해요. 프리셋을 다시
                고르면 처음 값으로 돌아가요.
              </T>
              <DayWeightBars
                weights={current.weights}
                min={data.min}
                max={data.max}
                today={today}
                onChange={drag}
                onDragging={setDragging}
              />
            </Card>
            <T
              size={13}
              color={colors.textMuted}
              style={{ paddingHorizontal: 4 }}
            >
              저장하면 오늘 하루 예산부터 남은 생활비를 남은 날의 요일 비중대로
              다시 나눠요. 입력한 잔액·기록 기준 추정이에요.
            </T>
            <ErrorNotice error={error} />
          </>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 20,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      >
        <Button
          label={busy ? "저장 중…" : "저장"}
          disabled={!changed || busy}
          onPress={save}
        />
      </View>
    </View>
  );
}
