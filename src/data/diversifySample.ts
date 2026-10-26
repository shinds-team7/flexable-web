// 분산 투자 시안(docs/product/proposal-active-passive.md §4)의 예시 값. 팀 논의용 화면 전용이다.
// 원 위의 순서는 '지난 기록에서 주가가 같이 움직인 정도'가 비슷한 것끼리 이웃하게 놓은 예시 배치다. 정반대 자리일수록 같이 덜 움직였다는 뜻이다.
// 채택되면 서버가 실제 기간 수익률로 같이 움직인 정도를 계산하고(KRX 업종 분류 + 일봉), 이 배치를 대신한다.
// 종목 목록은 업종별 시가총액 순 예시이며, 특정 종목을 고르라는 뜻이 아니다(01 §7 R1).

export type DivMode = 'sector' | 'asset' | 'alt';
export type DivItem = { name: string; note?: string };
export type DivCategory = { id: string; name: string; desc: string; items: DivItem[] };
export type DivModeInfo = { label: string; desc: string; listBasis: string; categories: DivCategory[] };

export const MODES: Record<DivMode, DivModeInfo> = {
  sector: {
    label: '섹터 분산',
    desc: '주식 안에서 업종을 나눠요. 같은 업종은 같은 소식에 함께 흔들리기 쉬워요.',
    listBasis: '시가총액 순',
    categories: [
      { id: 'semi', name: '반도체', desc: '메모리·시스템 반도체와 장비', items: [{ name: '삼성전자' }, { name: 'SK하이닉스' }, { name: '한미반도체' }, { name: 'DB하이텍' }] },
      { id: 'hw', name: 'IT 하드웨어', desc: '전자부품·가전', items: [{ name: '삼성전기' }, { name: 'LG전자' }, { name: 'LG이노텍' }] },
      { id: 'battery', name: '2차전지', desc: '배터리 셀·소재', items: [{ name: 'LG에너지솔루션' }, { name: '삼성SDI' }, { name: '포스코퓨처엠' }, { name: '에코프로비엠' }] },
      { id: 'auto', name: '자동차', desc: '완성차·부품', items: [{ name: '현대차' }, { name: '기아' }, { name: '현대모비스' }] },
      { id: 'heavy', name: '조선·기계', desc: '조선·발전 설비·기계', items: [{ name: 'HD현대중공업' }, { name: '한화오션' }, { name: '두산에너빌리티' }, { name: '삼성중공업' }] },
      { id: 'material', name: '화학·소재', desc: '화학·철강·비철금속', items: [{ name: 'LG화학' }, { name: 'POSCO홀딩스' }, { name: '고려아연' }, { name: '롯데케미칼' }] },
      { id: 'staples', name: '필수소비재', desc: '음식료·담배', items: [{ name: 'KT&G' }, { name: 'CJ제일제당' }, { name: '오리온' }, { name: '농심' }] },
      { id: 'telecom', name: '통신', desc: '이동통신·유선', items: [{ name: 'SK텔레콤' }, { name: 'KT' }, { name: 'LG유플러스' }] },
      { id: 'utility', name: '유틸리티', desc: '전력·가스', items: [{ name: '한국전력' }, { name: '한국가스공사' }, { name: '지역난방공사' }] },
      { id: 'finance', name: '금융', desc: '은행지주·보험·증권', items: [{ name: 'KB금융' }, { name: '신한지주' }, { name: '하나금융지주' }, { name: '삼성생명' }] },
      { id: 'health', name: '헬스케어', desc: '제약·바이오', items: [{ name: '삼성바이오로직스' }, { name: '셀트리온' }, { name: '유한양행' }, { name: 'SK바이오팜' }] },
      { id: 'internet', name: '인터넷·게임', desc: '플랫폼·게임', items: [{ name: 'NAVER' }, { name: '카카오' }, { name: '크래프톤' }, { name: '엔씨소프트' }] },
    ],
  },
  asset: {
    label: '자산 분산',
    desc: '주식만이 아니라 채권·현금성·달러처럼 성격이 다른 자산으로 나눠요.',
    listBasis: '국내 상장 상품 유형',
    categories: [
      { id: 'kr-eq', name: '국내 주식', desc: '코스피·코스닥 종목과 국내 지수 ETF', items: [{ name: '코스피200 추종 ETF' }, { name: '내가 고른 국내 종목' }] },
      { id: 'em-eq', name: '신흥국 주식', desc: '인도·베트남 등 신흥국 지수', items: [{ name: '신흥국 지수 추종 ETF(국내 상장)' }, { name: '인도 지수 추종 ETF(국내 상장)' }] },
      { id: 'us-eq', name: '미국 주식', desc: 'S&P 500·나스닥 100 등', items: [{ name: 'S&P 500 추종 ETF(국내 상장)', note: '환율 영향 받음' }, { name: '나스닥 100 추종 ETF(국내 상장)', note: '환율 영향 받음' }] },
      { id: 'corp', name: '회사채', desc: '기업이 빌린 돈에 투자', items: [{ name: '국내 회사채 ETF' }, { name: '미국 회사채 ETF(국내 상장)' }] },
      { id: 'usd', name: '달러', desc: '원화 가치가 떨어질 때 오르는 경우가 많았어요', items: [{ name: '미국 달러 선물 ETF(국내 상장)' }, { name: '달러 RP·외화 예금', note: '은행·증권사 상품' }] },
      { id: 'us-bond', name: '미국 장기 국채', desc: '만기 10년 이상 미국 국채', items: [{ name: '미국 장기 국채 ETF(국내 상장)', note: '환율 영향 받음' }, { name: '미국 장기 국채 ETF(환헤지)', note: '환율 영향 줄임' }] },
      { id: 'kr-bond', name: '국내 국채', desc: '한국 정부가 발행한 채권', items: [{ name: '국고채 3년 ETF' }, { name: '국고채 10년 ETF' }] },
      { id: 'cash', name: '단기채·현금성', desc: '만기가 짧아 덜 흔들리는 자산', items: [{ name: 'CD금리·KOFR 추종 ETF' }, { name: 'CMA·MMF' }] },
    ],
  },
  alt: {
    label: '대체자산 분산',
    desc: '주식·채권 바깥의 자산(금·원자재·부동산 등)으로 나눠요.',
    listBasis: '국내에서 사고팔 수 있는 방법',
    categories: [
      { id: 'equity', name: '주식', desc: '내가 가진 종목', items: [{ name: '내가 고른 종목' }] },
      { id: 'reits', name: '리츠', desc: '빌딩·물류센터 임대료를 나눠 받는 상장 회사', items: [{ name: '상장 리츠 종목' }, { name: '리츠 지수 ETF' }] },
      { id: 'infra', name: '인프라', desc: '도로·발전소 같은 사회기반시설', items: [{ name: '상장 인프라 펀드' }] },
      { id: 'gold', name: '금', desc: '위기 때 찾는 사람이 많았던 자산', items: [{ name: '금현물 계좌(KRX 금시장)', note: '매매차익 비과세' }, { name: '금 ETF(국내 상장)' }] },
      { id: 'dollar', name: '달러', desc: '원화와 반대로 움직인 때가 많았어요', items: [{ name: '미국 달러 선물 ETF(국내 상장)' }] },
      { id: 'commodity', name: '원자재', desc: '원유·구리·농산물', items: [{ name: '원유 선물 ETF(국내 상장)', note: '선물 교체 비용 있음' }, { name: '구리 선물 ETF(국내 상장)' }] },
    ],
  },
};

/** 고를 수 있는 내 종목(섹터 분산 기준 업종). 자산·대체자산 분산에서는 모두 '국내 주식'·'주식' 자리다. */
export const HOLDABLE = MODES.sector.categories.flatMap((c) => c.items.map((it) => ({ name: it.name, sector: c.id })));
export const HELD_IN: Record<Exclude<DivMode, 'sector'>, string> = { asset: 'kr-eq', alt: 'equity' };

/** 같이 움직인 정도(예시): 원 위에서 내 종목 칸과 떨어진 칸 수로 나눈다. farthest는 지금 가장 멀리 떨어진 칸 수. */
export function closeness(distance: number, farthest: number) {
  if (distance === 0) return { label: '내 종목', level: 3 };
  if (distance === farthest) return { label: '같이 가장 덜 움직임', level: 0 };
  if (distance <= 1) return { label: '같이 많이 움직임', level: 2 };
  return { label: '보통', level: 1 };
}
