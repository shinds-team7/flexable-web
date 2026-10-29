// F7 화면 시연 전용. 모든 금액·확률·비중·경로는 설계용 고정 예시이며 금융 모형의 산출값이 아니다.
// 서버/API/저장소를 사용하지 않고, 화면에서 수익·이자·자산·비중 금액을 계산하지 않는다(ADR-3).
export type DemoProfile = 'stable' | 'balanced' | 'growth';
export type DemoCaseId = 'home' | 'stretch' | 'small';

export const DEMO_PROFILES = [
  { id: 'stable', name: '안정형', caption: '크게 흔들리지 않도록', description: '손실 부담을 줄이며 차근차근 모으고 싶어요.', icon: 'shield' },
  { id: 'balanced', name: '균형형', caption: '안정과 성장 사이에서', description: '어느 정도의 변동을 감수하고 함께 키우고 싶어요.', icon: 'balance' },
  { id: 'growth', name: '성장형', caption: '변동을 감수하며 더 멀리', description: '손실 가능성을 이해하고 성장 기회를 찾고 싶어요.', icon: 'growth' },
] as const;

export const DEMO_PLANS = [
  {
    id: 'stable', title: '차근차근 지키기', subtitle: '저축 중심 · 변동 부담을 작게', risk: '낮음',
    description: '적금 비중을 높여 변동 부담을 줄인 조합이에요. 목표에 가까워지는 속도와 안정성을 함께 살펴보세요.',
    products: [
      { name: '일반 정기적금', kind: '상품 유형 예시', ratio: 60 },
      { name: 'TIGER 미국S&P500', kind: '해외 주식 ETF', ratio: 20 },
      { name: 'KODEX 200', kind: '국내 주식 ETF', ratio: 20 },
    ],
  },
  {
    id: 'balanced', title: '균형 있게 키우기', subtitle: '분산 투자 · 저축을 함께', risk: '중간',
    description: '국내외 ETF로 투자 대상을 나누고 적금을 함께 둔 조합이에요. 성장 가능성을 보면서도 한쪽에만 의존하지 않아요.',
    products: [
      { name: 'TIGER 미국S&P500', kind: '해외 주식 ETF', ratio: 40 },
      { name: 'KODEX 200', kind: '국내 주식 ETF', ratio: 30 },
      { name: '일반 정기적금', kind: '상품 유형 예시', ratio: 20 },
      { name: '삼성전자', kind: '국내 개별 주식', ratio: 10 },
    ],
  },
  {
    id: 'growth', title: '성장 기회 넓히기', subtitle: '주식 중심 · 변동성도 함께', risk: '높음',
    description: '주식과 ETF에 더 큰 비중을 둔 조합이에요. 잘 풀릴 때의 결과뿐 아니라, 목표보다 멀어지는 경우도 함께 확인하세요.',
    products: [
      { name: 'TIGER 미국S&P500', kind: '해외 주식 ETF', ratio: 40 },
      { name: '삼성전자', kind: '국내 개별 주식', ratio: 25 },
      { name: 'KODEX 200', kind: '국내 주식 ETF', ratio: 20 },
      { name: 'SK하이닉스', kind: '국내 개별 주식', ratio: 15 },
    ],
  },
] as const;

export type DemoOutcome = {
  chance: string;
  chanceBar: number;
  median: string;
  low: string;
  high: string;
  lossChance: string;
  medianLine: number[];
  lowLine: number[];
  highLine: number[];
};

export type DemoCase = {
  id: DemoCaseId;
  name: string;
  goal: string;
  target: string;
  current: string;
  monthly: string;
  duration: string;
  principal: string;
  summary: string;
  isSample: true;
  targetY: number; // 차트의 설계용 좌표. 금액 계산값이 아니다.
  axis: string[];
  periods: string[];
  principalLine: number[];
  caution?: string;
  alternatives?: string[];
  outcomes: Record<DemoProfile, DemoOutcome>;
};

// 차트 경로는 위에서부터의 y좌표(0~100)로 미리 그려 둔 시안. 입력값으로 수익을 재계산하지 않는다.
export const GOAL_DEMO_CASES: DemoCase[] = [
  {
    id: 'home', name: '3년 뒤 1억 원', goal: '내 집 마련의 첫걸음', target: '1억 원', current: '6,000만 원', monthly: '80만 원',
    duration: '3년', principal: '8,880만 원', summary: '6,000만 원으로 시작해 매달 80만 원씩, 3년 동안', isSample: true,
    targetY: 66.667, axis: ['1.8억', '1.4억', '1억', '6천만'], periods: ['지금', '6개월', '1년', '1년 6개월', '2년', '2년 6개월', '3년'],
    principalLine: [100, 96, 92, 88, 84, 80, 76],
    outcomes: {
      stable: { chance: '24%', chanceBar: 24, median: '9,560만', low: '8,920만', high: '1억 440만', lossChance: '7%', medianLine: [100, 95, 91, 85, 82, 76, 70.33], lowLine: [100, 97, 94, 90, 86, 81, 75.67], highLine: [100, 93, 87, 80, 74, 68, 63] },
      balanced: { chance: '63%', chanceBar: 63, median: '1억 540만', low: '7,860만', high: '1억 3,350만', lossChance: '18%', medianLine: [100, 93, 90, 82, 78, 69, 62.17], lowLine: [100, 99, 98, 93, 95, 89, 84.5], highLine: [100, 87, 77, 69, 58, 48, 38.75] },
      growth: { chance: '67%', chanceBar: 67, median: '1억 1,420만', low: '6,320만', high: '1억 6,980만', lossChance: '34%', medianLine: [100, 92, 94, 80, 77, 63, 54.83], lowLine: [100, 100, 100, 100, 100, 99, 97.33], highLine: [100, 84, 70, 58, 38, 22, 8.5] },
    },
  },
  {
    id: 'stretch', name: '월 50만 원으로 1억 원', goal: '나의 첫 1억 원', target: '1억 원', current: '0원', monthly: '50만 원',
    duration: '3년', principal: '1,800만 원', summary: '0원으로 시작해 매달 50만 원씩, 3년 동안', isSample: true,
    targetY: 0, axis: ['1억', '7,500만', '5천만', '2,500만', '0원'], periods: ['지금', '6개월', '1년', '1년 6개월', '2년', '2년 6개월', '3년'],
    principalLine: [100, 97, 94, 91, 88, 85, 82],
    caution: '현재 조건으로는 목표에 닿기 어려워요',
    alternatives: ['매달 모을 수 있는 금액 늘리기', '목표까지의 시간 넉넉히 잡기', '먼저 달성할 중간 목표 세우기'],
    outcomes: {
      stable: { chance: '1% 미만', chanceBar: 1, median: '1,940만', low: '1,750만', high: '2,160만', lossChance: '6%', medianLine: [100, 97, 94, 91, 88, 84, 80.6], lowLine: [100, 98, 96, 93, 90, 87, 82.5], highLine: [100, 96, 93, 89, 85, 82, 78.4] },
      balanced: { chance: '1% 미만', chanceBar: 1, median: '2,210만', low: '1,520만', high: '3,360만', lossChance: '21%', medianLine: [100, 96, 93, 90, 86, 82, 77.9], lowLine: [100, 98, 97, 95, 92, 89, 84.8], highLine: [100, 94, 89, 84, 78, 72, 66.4] },
      growth: { chance: '2%', chanceBar: 2, median: '2,560만', low: '1,080만', high: '4,920만', lossChance: '36%', medianLine: [100, 96, 94, 89, 85, 80, 74.4], lowLine: [100, 99, 98, 97, 95, 92, 89.2], highLine: [100, 93, 86, 77, 68, 59, 50.8] },
    },
  },
  {
    id: 'small', name: '1년 뒤 700만 원', goal: '여유 있게 떠나는 여행', target: '700만 원', current: '200만 원', monthly: '40만 원',
    duration: '1년', principal: '680만 원', summary: '200만 원으로 시작해 매달 40만 원씩, 1년 동안', isSample: true,
    targetY: 44.444, axis: ['1,100만', '800만', '500만', '200만'], periods: ['지금', '2개월', '4개월', '6개월', '8개월', '10개월', '1년'],
    principalLine: [100, 91.111, 82.222, 73.333, 64.444, 55.555, 46.667],
    outcomes: {
      stable: { chance: '42%', chanceBar: 42, median: '695만', low: '670만', high: '725만', lossChance: '9%', medianLine: [100, 91, 82, 73, 63, 54, 45], lowLine: [100, 93, 85, 76, 67, 57, 47.778], highLine: [100, 88, 79, 69, 60, 50, 41.667] },
      balanced: { chance: '55%', chanceBar: 55, median: '710만', low: '580만', high: '870만', lossChance: '24%', medianLine: [100, 90, 83, 71, 62, 52, 43.333], lowLine: [100, 95, 87, 80, 74, 66, 57.778], highLine: [100, 85, 72, 60, 48, 36, 25.555] },
      growth: { chance: '58%', chanceBar: 58, median: '735만', low: '460만', high: '1,050만', lossChance: '39%', medianLine: [100, 90, 86, 73, 65, 52, 40.556], lowLine: [100, 96, 92, 88, 83, 77, 71.111], highLine: [100, 82, 69, 53, 40, 26, 5.556] },
    },
  },
];
