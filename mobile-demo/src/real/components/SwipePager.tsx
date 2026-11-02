import { Children, useState, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";

/**
 * 옆으로 넘겨 보는 카드 묶음. 다음 카드가 옆에 살짝 보여서 넘길 카드가 있다는 걸 알 수 있다.
 * 쪽이 하나뿐이면 그대로 그린다.
 */
export function SwipePager({ children }: { children: ReactNode }) {
  const pages = Children.toArray(children);
  const [width, setWidth] = useState(0);
  if (pages.length < 2) return <>{pages}</>;
  // Each card leaves room for the gap and a sliver of the next card.
  const card = width - GAP - PEEK;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Until the width is known only the first page is drawn, so it still sets the height. */}
      {width === 0 ? (
        pages[0]
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Native snaps by interval; the web has no snapToInterval, so it snaps with CSS instead.
          snapToInterval={card + GAP}
          decelerationRate="fast"
          disableIntervalMomentum
          style={styles.scroller}
          contentContainerStyle={{ gap: GAP }}
        >
          {pages.map((content, i) => (
            <View key={i} style={[styles.page, { width: card }]}>
              {content}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const GAP = 10;
const PEEK = 24;
const styles = StyleSheet.create({
  scroller: Platform.select({
    web: { scrollSnapType: "x mandatory" } as object,
    default: {},
  }),
  page: Platform.select({
    web: { scrollSnapAlign: "start" } as object,
    default: {},
  }),
});
