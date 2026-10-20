// 플러스 요금제 데이터. 가격·한도는 확정값(docs/product/01-product.md §5-3, F6)이고, 서버 API가 생기면 fetch 안만 바꾼다.
// 해커톤은 모의 결제다. 실제 청구는 없다.
import { useQuery } from '@tanstack/react-query';

export type Period = 'YEARLY' | 'MONTHLY';
export type PlanPrice = { period: Period; amount: number; unit: '년' | '월' };
export type PlanFeature = { title: string; desc: string };
export type CompareRow = { feature: string; free: string; plus: string };

export type Plans = {
  prices: Record<Period, PlanPrice>;
  defaultPeriod: Period;
  yearlySaving: number; // 월 990원 × 12 − 연 9,900원(서버가 내려 줄 값)
  plusFeatures: PlanFeature[];
  freeFeatures: PlanFeature[];
  compare: CompareRow[];
};

export type Subscription = { plan: 'FREE' | 'PLUS'; period: Period | null; planUntil: string | null };

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

// TODO(BE): GET /api/v1/billing/plans (docs/product/03-architecture.md, {plans,limits,features,defaultPeriod})
async function fetchPlans(): Promise<Plans> {
  return delay({
    prices: {
      YEARLY: { period: 'YEARLY', amount: 9900, unit: '년' },
      MONTHLY: { period: 'MONTHLY', amount: 990, unit: '월' },
    },
    defaultPeriod: 'YEARLY',
    yearlySaving: 1980,
    plusFeatures: [
      { title: '정책 마감 리마인더', desc: '챙긴 정책 소식의 마감 3일 전·당일에 이메일로 알려 주고, 내 마감 목록을 모아 보여 줘요' },
      { title: '월간 내 돈 리포트', desc: '주기별 남긴 돈, 저축 속도 변화, 목표 진행을 한 장으로. 내 기록 해설만 담아요' },
      { title: '정밀 모드', desc: '투자 시뮬레이션에 배당 재투자·수수료·세금을 반영해요' },
      { title: '저장 확대', desc: '종목·상품 5개, 프리셋 50개, 비교 5개까지' },
      { title: '광고 없음', desc: '광고를 도입하더라도 플러스에는 보이지 않아요' },
    ],
    freeFeatures: [
      { title: '청년 금융 소식 전부', desc: '맞춤 필터와 챙기기까지 모두 무료예요' },
      { title: '투자 시뮬레이션', desc: '넣는 방식 3종, 기간 칩·날짜 지정, 사건 설명 전부' },
      { title: '적금 비교·정책 적금', desc: '지금 상품, 과거 평균, 정책 적금 조건 입력' },
      { title: '섞어보기·공유', desc: '종목·상품 3개, 프리셋 3개, 비교 2개, 공유 링크' },
    ],
    compare: [
      { feature: '정책 마감 리마인더', free: '—', plus: '제공' },
      { feature: '월간 내 돈 리포트', free: '—', plus: '제공' },
      { feature: '소식·맞춤 필터·챙기기', free: '전부', plus: '전부' },
      { feature: '투자 시뮬레이션·기간 칩·날짜 지정·사건 설명', free: '전부', plus: '전부' },
      { feature: '적금 비교·정책 적금·공유', free: '전부', plus: '전부' },
      { feature: '종목 / 비교 / 프리셋', free: '3 / 2 / 3', plus: '5 / 5 / 50' },
      { feature: '정밀 모드(배당 재투자·수수료·세금)', free: '—', plus: '제공' },
      { feature: '광고 없음', free: '—', plus: '제공' },
    ],
  });
}

// TODO(BE): GET /api/v1/me/subscription. 지금은 모두 무료로 본다.
async function fetchSubscription(): Promise<Subscription> {
  return delay({ plan: 'FREE', period: null, planUntil: null });
}

export const usePlans = () => useQuery({ queryKey: ['billing', 'plans'], queryFn: fetchPlans, staleTime: 5 * 60_000 });
export const useSubscription = (enabled: boolean) => useQuery({ queryKey: ['me', 'subscription'], queryFn: fetchSubscription, enabled });
