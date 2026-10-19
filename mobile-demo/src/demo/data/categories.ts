import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type CategoryId =
  | 'food'
  | 'cafe'
  | 'transport'
  | 'shopping'
  | 'culture'
  | 'living'
  | 'etc'
  | 'fixed'
  | 'income'
  | 'transfer'
  | 'self'
  | 'pending';

export type Category = { id: CategoryId; name: string; color: string; icon: IconName };

/** 생활비(변동지출) 카테고리 — 분석/예산 대상 */
export const SPEND_CATEGORIES: Category[] = [
  { id: 'food', name: '식비', color: '#12B76A', icon: 'restaurant' },
  { id: 'cafe', name: '카페·간식', color: '#F79009', icon: 'cafe' },
  { id: 'shopping', name: '쇼핑', color: '#7A5AF8', icon: 'bag-handle' },
  { id: 'transport', name: '교통', color: '#2E90FA', icon: 'bus' },
  { id: 'culture', name: '문화·여가', color: '#EE46BC', icon: 'film' },
  { id: 'living', name: '생활·마트', color: '#15B79E', icon: 'cart' },
  { id: 'etc', name: '기타', color: '#98A2B3', icon: 'ellipsis-horizontal' },
];

const EXTRA: Category[] = [
  { id: 'fixed', name: '고정지출', color: '#667085', icon: 'repeat' },
  { id: 'income', name: '수입', color: '#2E90FA', icon: 'arrow-down' },
  { id: 'transfer', name: '송금', color: '#F04438', icon: 'paper-plane' },
  { id: 'self', name: '내 계좌 이동', color: '#667085', icon: 'swap-horizontal' },
  { id: 'pending', name: '확인 필요', color: '#F79009', icon: 'help' },
];

const ALL = [...SPEND_CATEGORIES, ...EXTRA];

export function getCategory(id: CategoryId): Category {
  return ALL.find((c) => c.id === id) ?? SPEND_CATEGORIES[SPEND_CATEGORIES.length - 1];
}
