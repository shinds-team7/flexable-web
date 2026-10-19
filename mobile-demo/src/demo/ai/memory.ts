/**
 * AI 메모리 (Mock) — 가입 시 불러온 6개월 거래내역으로 AI가 학습한 "나의 소비 단가".
 * 예정 지출의 금액을 제안할 때 이 값을 사용하고, 일정 정산 후 실제 금액으로 갱신된다.
 * 실제 서비스에서는 AI 서버(FastAPI)가 관리한다.
 */
import type { CategoryId } from '@/demo/data/categories';

export type MemoryItem = {
  id: string;
  label: string; // 사용자에게 보이는 이름
  keywords: string[]; // 자연어에서 이 항목을 찾는 단서
  category: CategoryId;
  amount: number; // 1회 평균 본인 부담액
  count: number; // 학습에 쓰인 횟수
  editedByUser?: boolean;
};

export const DEFAULT_MEMORY: MemoryItem[] = [
  { id: 'm1', label: '술자리·회식', keywords: ['회식', '술', '맥주', '소주', '뒷풀이', '뒤풀이', '한잔', '호프', '포차'], category: 'food', amount: 34300, count: 6 },
  { id: 'm2', label: '저녁 외식', keywords: ['저녁', '외식', '맛집', '식사', '밥'], category: 'food', amount: 18500, count: 14 },
  { id: 'm3', label: '점심', keywords: ['점심'], category: 'food', amount: 9800, count: 41 },
  { id: 'm4', label: '카페', keywords: ['카페', '커피', '스터디'], category: 'cafe', amount: 6200, count: 37 },
  { id: 'm5', label: '영화', keywords: ['영화', 'cgv', '메가박스', '롯데시네마'], category: 'culture', amount: 15000, count: 4 },
  { id: 'm6', label: '생일·선물', keywords: ['생일', '선물', '생신', '기념일'], category: 'shopping', amount: 30000, count: 3 },
  { id: 'm7', label: '미용실', keywords: ['미용실', '헤어', '커트', '펌', '염색'], category: 'living', amount: 25000, count: 2 },
  { id: 'm8', label: '노래방', keywords: ['노래방', '코노'], category: 'culture', amount: 8000, count: 5 },
  { id: 'm9', label: '택시', keywords: ['택시', '카카오t'], category: 'transport', amount: 11200, count: 9 },
  { id: 'm10', label: '병원·약국', keywords: ['병원', '치과', '약국', '진료', '검진'], category: 'etc', amount: 12000, count: 3 },
];

/** 금액과 무관한 소비 습관 (AI가 발견한 패턴) */
export type Insight = { id: string; text: string; source: string };
export const DEFAULT_INSIGHTS: Insight[] = [
  { id: 'i1', text: '금요일 지출이 다른 요일보다 평균 1.6배 많아요', source: '최근 6개월 요일별 지출' },
  { id: 'i2', text: '카페는 주 4회, 주로 오전 8~9시에 가요', source: '카페 결제 37건' },
  { id: 'i3', text: '월급날 이후 3일 동안 쇼핑 지출이 몰려요', source: '쇼핑 결제 22건' },
  { id: 'i4', text: '술자리 다음 날 택시·배달 지출이 늘어요', source: '술자리 6회 전후 비교' },
];
