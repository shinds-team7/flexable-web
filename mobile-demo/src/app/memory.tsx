/** AI 메모리 관리 — AI가 학습한 나의 소비 단가·습관 보기/수정 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { MemoryItem } from '@/demo/ai/memory';
import { SubHeader } from '@/components/SubHeader';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, IconCircle, Screen, SectionTitle, Sheet, T } from '@/components/ui';
import { getCategory } from '@/demo/data/categories';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function Memory() {
  const { memory, updateMemory, insights, removeInsight, restoreInsight } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [raw, setRaw] = useState('');
  const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="AI 메모리" fallback={demoRoutes.my} />
      <Screen>
        <Card style={{ backgroundColor: colors.brandSofter }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={16} color={colors.brand} />
            <T size={15} weight="700">
              AI가 기억하는 나의 소비
            </T>
          </View>
          <T size={13} color={colors.textSub} style={{ marginTop: 6, lineHeight: 19 }}>
            가입할 때 불러온 6개월 거래내역으로 배웠고, 일정을 정산할 때마다 다시 학습해요.{'\n'}예정 지출 금액을 제안할 때 이 값을 써요. 다르면 고쳐 주세요.
          </T>
        </Card>

        <Card>
          <SectionTitle title="한 번 갈 때 쓰는 돈" />
          <View style={{ gap: 4 }}>
            {memory.map((m) => {
              const c = getCategory(m.category);
              return (
                <Pressable accessibilityRole="button"
                  key={m.id}
                  style={styles.row}
                  onPress={() => {
                    setEditing(m);
                    setRaw(String(m.amount));
                  }}
                >
                  <IconCircle name={c.icon} color={c.color} size={38} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T size={15} weight="600">
                        {m.label}
                      </T>
                      {m.editedByUser && <Badge label="직접 수정" color={colors.info} bg={colors.infoSoft} />}
                    </View>
                    <T size={12} color={colors.textMuted} numberOfLines={1}>
                      {m.count}회 학습 · “{m.keywords.slice(0, 3).join(', ')}”
                    </T>
                  </View>
                  <T size={15} weight="700">
                    {won(m.amount)}원
                  </T>
                  <Ionicons name="create-outline" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionTitle title="발견한 소비 습관" />
          <View style={{ gap: 10 }}>
            {insights.map((i) => (
              <View key={i.id} style={styles.insight}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="600" style={{ lineHeight: 20 }}>
                    {i.text}
                  </T>
                  <T size={12} color={colors.textMuted}>
                    근거: {i.source}
                  </T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`‘${i.text}’ 습관 잊기`}
                  onPress={() => {
                    removeInsight(i.id);
                    toast('습관을 잊었어요', () => restoreInsight(i));
                  }}
                  hitSlop={8}
                  style={styles.forget}
                >
                  <T size={12} weight="600" color={colors.textMuted}>
                    잊기
                  </T>
                </Pressable>
              </View>
            ))}
            {insights.length === 0 && (
              <T size={13} color={colors.textMuted} style={{ textAlign: 'center', paddingVertical: 12 }}>
                저장된 습관이 없어요
              </T>
            )}
          </View>
        </Card>
      </Screen>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={`${editing?.label ?? ''} 금액 수정`} subtitle="다음 예정 지출부터 이 금액으로 제안해요">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput accessibilityLabel="금액" value={amount ? won(amount) : ''} onChangeText={setRaw} keyboardType="number-pad" inputMode="numeric" style={[styles.input, noOutline]} />
          <T size={18} weight="700">
            원
          </T>
        </View>
        <Button
          label="저장"
          disabled={amount <= 0}
          style={{ marginTop: 20 }}
          onPress={() => {
            if (editing) updateMemory(editing.id, amount);
            setEditing(null);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 14, padding: 14 },
  forget: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff' },
  input: { flex: 1, height: 54, borderRadius: 14, backgroundColor: colors.bg, paddingHorizontal: 14, fontSize: 20, fontWeight: '700', textAlign: 'right', color: colors.text, fontFamily: font },
});
