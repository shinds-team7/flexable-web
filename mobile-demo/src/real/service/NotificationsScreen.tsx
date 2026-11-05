import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { SwipeToDelete } from "@/real/components/SwipeToDelete";
import { colors } from "@/real/theme";
import { useInbox, type InboxItem } from "./inbox";
import {
  deleteInboxItem,
  markInboxItemRead,
  markInboxItemsRead,
} from "./inboxStore";
import { ErrorNotice, Loading, seoulDate } from "./ui";

/**
 * 알림함. 헤더 종 아이콘에서 들어온다. 최근 30일의 코인 적립·사용, 고정지출 자동 기록,
 * 오늘 예산 상태, 이 기기에서 보낸 시드머니·기록 알림을 최신순으로 보여 준다.
 * 직접 누른 항목만 읽음으로 하고, 맨 위 [전체 확인]은 한꺼번에 읽음으로 한다.
 * 알림은 왼쪽으로 밀어 지울 수 있다(지운 알림은 이 기기에서만 숨긴다).
 */
export function NotificationsScreen() {
  const { id, items, isUnread, error, loading, retry } = useInbox();
  // 밀어서 지운 직후 저장이 반영되기 전까지 바로 숨긴다
  const [removed, setRemoved] = useState<string[]>([]);

  const groups = new Map<string, InboxItem[]>();
  (items ?? [])
    .filter((item) => !removed.includes(item.key))
    .forEach((item) => {
      const d = seoulDay(item.at);
      groups.set(d, [...(groups.get(d) ?? []), item]);
    });
  const unread = (items ?? []).filter(
    (item) => !removed.includes(item.key) && isUnread(item),
  );

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="알림함" fallback="/home" />
      <Screen>
        <ErrorNotice error={error} retry={retry} />
        {loading ? (
          <Loading />
        ) : (
          items && (
            <Card style={{ paddingVertical: 8 }}>
              {groups.size === 0 && (
                <T style={{ paddingVertical: 24, textAlign: "center" }}>
                  최근 30일 동안 온 알림이 없어요
                </T>
              )}
              {[...groups].map(([date, list], i) => (
                <View
                  key={date}
                  style={
                    i > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                      marginTop: 6,
                    }
                  }
                >
                  <View style={styles.dateRow}>
                    <T size={13} weight="700">
                      {date === seoulDate() ? "오늘" : date}
                    </T>
                    {i === 0 && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="알림 전체 확인"
                        accessibilityState={{ disabled: unread.length === 0 }}
                        disabled={unread.length === 0}
                        hitSlop={8}
                        onPress={() => {
                          if (id)
                            markInboxItemsRead(id, unread).catch(() => {});
                        }}
                      >
                        <T size={12} color="#A9B0BF" style={styles.readAll}>
                          전체 확인
                        </T>
                      </Pressable>
                    )}
                  </View>
                  {list.map((item) => (
                    <View key={item.key} style={styles.swipe}>
                      <SwipeToDelete
                        background={
                          isUnread(item) ? colors.brandSoft : colors.card
                        }
                        deleteLabel="알림 삭제"
                        onDelete={() => {
                          setRemoved((x) => [...x, item.key]);
                          if (id) deleteInboxItem(id, item).catch(() => {});
                        }}
                      >
                        <Row
                          item={item}
                          fresh={isUnread(item)}
                          onOpen={() => {
                            if (id) markInboxItemRead(id, item).catch(() => {});
                            router.push(item.href);
                          }}
                        />
                      </SwipeToDelete>
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          )
        )}
      </Screen>
    </View>
  );
}

function seoulDay(at: number) {
  return new Date(at + 9 * 3600000).toISOString().slice(0, 10);
}

function Row({
  item,
  fresh,
  onOpen,
}: {
  item: InboxItem;
  fresh: boolean;
  onOpen: () => void;
}) {
  const time = new Date(item.at + 9 * 3600000).toISOString().slice(11, 16);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        fresh ? "새 알림" : "",
        item.title,
        item.detail,
        time,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onOpen}
      style={[styles.row, fresh && styles.fresh]}
    >
      <View style={[styles.icon, { backgroundColor: item.color + "1F" }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="700" num numberOfLines={1}>
          {item.title}
        </T>
        {item.detail !== "" && (
          <T size={12} color={colors.textMuted} numberOfLines={2}>
            {item.detail}
          </T>
        )}
      </View>
      <T size={12} color={colors.textMuted} num>
        {time}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingBottom: 6,
  },
  readAll: { textDecorationLine: "underline" },
  // The unread background and the swipe area span the card edge to edge (card padding 20) without moving the text.
  swipe: { marginHorizontal: -20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  // 이번에 새로 온(안 읽은) 알림은 옅은 블루 바탕으로 구분한다.
  fresh: { backgroundColor: colors.brandSoft },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
