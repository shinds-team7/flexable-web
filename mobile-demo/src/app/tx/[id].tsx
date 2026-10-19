/** 거래 상세 — 최하단에 [1/N] [반영 제외] 버튼 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SubHeader } from '@/components/SubHeader';
import { Badge, Button, Card, ConfirmModal, IconCircle, Screen, Sheet, T } from '@/components/ui';
import { getCategory, SPEND_CATEGORIES } from '@/demo/data/categories';
import { computeBudget } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { fromKey } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function TxDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, updateTx, budgetInput, summary } = useStore();
  const tx = transactions.find((t) => t.id === id);
  const [splitOpen, setSplitOpen] = useState(false);
  const [n, setN] = useState(tx?.splitN && tx.splitN > 1 ? tx.splitN : 2);
  const [excludeOpen, setExcludeOpen] = useState(false);

  if (!tx) {
    return (
      <View style={{ flex: 1 }}>
        <SubHeader title="거래 상세" fallback={demoRoutes.transactions} />
        <Screen>
          <T color={colors.textMuted}>거래를 찾을 수 없어요</T>
        </Screen>
      </View>
    );
  }

  const c = getCategory(tx.category);
  const d = fromKey(tx.date);
  const isOut = tx.amount < 0;
  const canAdjust = isOut && (SPEND_CATEGORIES.some((x) => x.id === tx.category) || tx.category === 'transfer');
  const split = tx.splitN && tx.splitN > 1 ? tx.splitN : 0;
  const myShare = split ? Math.round(-tx.amount / split) : -tx.amount;

  /** 변경했을 때 하루 기준액이 어떻게 바뀌는지 미리보기 */
  const previewDaily = (patch: { excluded?: boolean; splitN?: number }) =>
    computeBudget({ ...budgetInput, transactions: budgetInput.transactions.map((t) => (t.id === tx.id ? { ...t, ...patch } : t)) }).todayAvailable;

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="거래 상세" fallback={demoRoutes.transactions} />
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <IconCircle name={c.icon} color={c.color} size={56} />
          <T size={16} weight="600" color={colors.textSub} style={{ marginTop: 12 }}>
            {tx.merchant}
          </T>
          <T
            size={30}
            weight="800"
            color={tx.excluded ? colors.textMuted : isOut ? colors.text : colors.info}
            style={[{ marginTop: 4 }, tx.excluded || split ? { textDecorationLine: 'line-through' } : null]}
          >
            {isOut ? '' : '+'}
            {won(tx.amount)}원
          </T>
          {split > 0 && (
            <T size={18} weight="800" color={colors.info} style={{ marginTop: 4 }}>
              내 부담 {won(myShare)}원 (1/{split})
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {tx.excluded && <Badge label="생활비 반영 제외" color={colors.textSub} bg={colors.bg} />}
            {split > 0 && <Badge label={`${won(-tx.amount - myShare)}원 돌려받을 예정`} color={colors.info} bg={colors.infoSoft} />}
          </View>
        </Card>

        <Card style={{ gap: 2 }}>
          <Info label="일시" value={`${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) ${tx.time}`} />
          <Info label="카테고리" value={c.name} />
          <Info label="결제 수단" value={tx.account} />
          <Info label="생활비 반영" value={!canAdjust ? '해당 없음' : tx.excluded ? '제외' : `${won(myShare)}원`} />
        </Card>

        {canAdjust && (
          <Card style={{ backgroundColor: colors.brandSofter }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle" size={16} color={colors.brandDark} style={{ marginTop: 1 }} />
              <T size={13} color={colors.textSub} style={{ flex: 1, lineHeight: 19 }}>
                여럿이 먹고 내가 한 번에 결제했다면 <T size={13} weight="700">1/N</T>, 회사 경비·대신 결제처럼 내 생활비가 아니면{' '}
                <T size={13} weight="700">반영 제외</T>를 눌러 주세요. 오늘 쓸 수 있는 돈이 바로 다시 계산돼요.
              </T>
            </View>
          </Card>
        )}
      </Screen>

      {/* 최하단 고정 버튼: 왼쪽 1/N, 오른쪽 반영 제외 */}
      {canAdjust && (
        <View style={styles.bottom}>
          <Button
            label={split ? `1/${split} 수정` : '1/N'}
            variant="soft"
            icon="people"
            style={{ flex: 1 }}
            disabled={!!tx.excluded}
            onPress={() => setSplitOpen(true)}
          />
          <Button
            label={tx.excluded ? '다시 반영' : '반영 제외'}
            variant={tx.excluded ? 'primary' : 'soft'}
            icon={tx.excluded ? 'refresh' : 'remove-circle-outline'}
            style={{ flex: 1 }}
            onPress={() => (tx.excluded ? updateTx(tx.id, { excluded: false }) : setExcludeOpen(true))}
          />
        </View>
      )}

      <Sheet visible={splitOpen} onClose={() => setSplitOpen(false)} title="1/N 나누기" subtitle="몇 명이서 나눠 내나요? 나머지는 돌려받을 돈으로 처리해요">
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="인원 줄이기" style={styles.stepBtn} onPress={() => setN(Math.max(2, n - 1))}>
            <Ionicons name="remove" size={22} color={colors.text} />
          </Pressable>
          <T size={28} weight="800" style={{ flex: 1, textAlign: 'center' }}>
            {n}명
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="인원 늘리기" style={styles.stepBtn} onPress={() => setN(Math.min(20, n + 1))}>
            <Ionicons name="add" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.calc}>
          <Row label="결제 금액" value={`${won(-tx.amount)}원`} />
          <Row label="내 부담" value={`${won(Math.round(-tx.amount / n))}원`} strong />
          <Row label="돌려받을 돈" value={`${won(-tx.amount - Math.round(-tx.amount / n))}원`} />
          <View style={styles.preview}>
            <T size={13} color={colors.textSub}>
              오늘 쓸 수 있는 돈
            </T>
            <T size={14} weight="800" color={colors.brandDark}>
              {won(Math.max(0, summary.todayAvailable))} → {won(Math.max(0, previewDaily({ splitN: n })))}원
            </T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          {split > 0 && (
            <Button
              label="나누지 않기"
              variant="soft"
              style={{ flex: 1 }}
              onPress={() => {
                updateTx(tx.id, { splitN: undefined });
                setSplitOpen(false);
              }}
            />
          )}
          <Button
            label={`1/${n} 적용`}
            style={{ flex: 2 }}
            onPress={() => {
              updateTx(tx.id, { splitN: n });
              setSplitOpen(false);
            }}
          />
        </View>
      </Sheet>

      <ConfirmModal
        visible={excludeOpen}
        title="생활비에서 제외할까요?"
        message={`‘${tx.merchant}’ ${won(-tx.amount)}원을 소비에서 빼고 생활비로 되돌려요.\n오늘 쓸 수 있는 돈: ${won(Math.max(0, summary.todayAvailable))} → ${won(Math.max(0, previewDaily({ excluded: true })))}원`}
        confirmLabel="반영 제외"
        onCancel={() => setExcludeOpen(false)}
        onConfirm={() => {
          updateTx(tx.id, { excluded: true, splitN: undefined });
          setExcludeOpen(false);
        }}
      />
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <T size={14} color={colors.textMuted}>
        {label}
      </T>
      <T size={14} weight="600">
        {value}
      </T>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.info}>
      <T size={14} color={colors.textSub}>
        {label}
      </T>
      <T size={strong ? 17 : 14} weight={strong ? '800' : '600'}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  bottom: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 24, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 16, padding: 10 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  calc: { marginTop: 14 },
  preview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.brandSofter, borderRadius: 12, padding: 12, marginTop: 8 },
});
