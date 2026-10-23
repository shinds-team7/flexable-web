// 청년 금융 소식(/news) 데이터. 필드 이름은 01-product.md F4 "카드 필수 항목 = API 필드"를 따른다.
// 웹 백엔드의 승인된 소식을 받는다. 승인된 소식이 없으면 예시 소식을 돌려주고, isSample=true면 화면이 "예시" 표시를 붙인다.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { addDays, todayKst } from '@/lib/deadline';

export const NEWS_CATEGORIES = [
  { id: 'TRANSPORT', label: '교통' },
  { id: 'HOUSING', label: '주거' },
  { id: 'FINANCE', label: '금융' },
  { id: 'JOB', label: '일자리' },
  { id: 'EDUCATION', label: '교육' },
  { id: 'CULTURE', label: '생활·문화' },
  { id: 'TAX', label: '세금' },
  { id: 'ETC', label: '기타' }, // 어느 분야에도 맞지 않는 소식(참여·권리 등)
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]['id'];
export const categoryLabel = (c: NewsCategory) => NEWS_CATEGORIES.find((x) => x.id === c)?.label ?? c;

// 지역 분류는 API 값이 정해지면 맞춘다. '전국' 소식은 어느 지역을 골라도 보인다.
export const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] as const;
export type RegionName = (typeof REGIONS)[number];

export const AGE_BANDS = [
  { id: '19-24', label: '만 19~24세', min: 19, max: 24 },
  { id: '25-29', label: '만 25~29세', min: 25, max: 29 },
  { id: '30-34', label: '만 30~34세', min: 30, max: 34 },
  { id: '35-39', label: '만 35~39세', min: 35, max: 39 },
] as const;
export type AgeBandId = (typeof AGE_BANDS)[number]['id'];

export type YouthNews = {
  id: string;
  category: NewsCategory; // 대표 분야(배지)
  categories?: NewsCategory[]; // 이 소식이 드는 분야 전부(탭은 이것으로 거른다). 없으면 [category]
  title: string; // 쉬운 말 2줄 이내
  benefit: string; // 나에게 얼마. 원문 수치 그대로(생성 금지)
  audience: {
    summary: string; // 나이 외 조건 요약(거주·소득·재직 등). 나이는 ageMin/ageMax로 따로 표시
    ageMin: number | null; // null = 원문에서 확인 못 함(조건 없음이 아님)
    ageMax: number | null;
    incomeLimit: boolean | null; // 소득 기준이 원문에 있으면 true. 원문에 언급이 없으면 null(카드에 표시 안 함)
  };
  regions: 'NATIONWIDE' | RegionName[];
  applyStart: string | null; // KST YYYY-MM-DD
  applyDeadline: string | null;
  alwaysOpen: boolean; // 상시 모집이 확인된 경우만 true. 마감일이 없다고 상시가 아니다
  action: string; // 오늘 할 일 하나
  source: { org: string; url: string; asOf: string }; // 1차 출처 없으면 게시하지 않는다
  postedAt: string | null; // 원문 게시일. 없으면 새로운 순에서 맨 아래
  keywords?: string[];
  calcLink?: { to: string; label: string } | null; // 관련 계산 화면(조건 채운 채)
  correctedAt?: string | null;
  slot?: 'MAIN' | 'SUB' | null; // 편집자가 지정한 오늘의 한 장(MAIN 1) · 보조(SUB 3)
};

/** isPreview: 서버가 검수 전 초안까지 보낸 로컬 미리보기(backend local 프로필). 운영에서는 늘 false */
export type NewsFeed = { items: YouthNews[]; isSample: boolean; isPreview?: boolean };

export const newsCategories = (n: Pick<YouthNews, 'category' | 'categories'>) =>
  n.categories && n.categories.length > 0 ? n.categories : [n.category];

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

// 예시 소식은 모두 가상이다(기관·금액 포함). D-day 경우(임박·여유·오늘·상시·미정·접수 전·마감)가 날짜가 지나도 유지되도록
// 예시에서만 오늘 기준 상대 날짜로 만든다. 실제 API는 원문 날짜를 그대로 쓴다. 링크는 실제 공고가 아니라 온통청년 첫 화면이다.
function sampleNews(): YouthNews[] {
  const t = todayKst();
  const d = (n: number) => addDays(t, n);
  const src = (org: string) => ({ org, url: 'https://www.youthcenter.go.kr', asOf: d(-1) });
  return [
    {
      id: 'n1', category: 'TRANSPORT', slot: 'MAIN',
      title: '청년 대중교통비 환급 비율 올라요',
      benefit: '한 달 교통비의 최대 30% 돌려받기',
      audience: { summary: '소득 조건은 공고문 확인', ageMin: 19, ageMax: 34, incomeLimit: null },
      regions: 'NATIONWIDE', applyStart: d(-10), applyDeadline: d(3), alwaysOpen: false,
      action: '쓰고 있는 교통카드 앱에서 환급 서비스 신청하기',
      source: src('○○부(예시)'), postedAt: d(-2), keywords: ['교통비', '환급', '교통카드', '지하철', '버스'],
    },
    {
      id: 'n2', category: 'HOUSING', slot: 'SUB',
      title: '○○시 청년 월세 지원 2차 신청',
      benefit: '월 최대 20만 원 · 12개월',
      audience: { summary: '서울 거주 · 소득 기준 있음', ageMin: 19, ageMax: 34, incomeLimit: true },
      regions: ['서울'], applyStart: d(-6), applyDeadline: d(5), alwaysOpen: false,
      action: '임대차계약서와 월세 이체 내역 준비하기',
      source: src('○○시청(예시)'), postedAt: d(-6), correctedAt: d(-1), keywords: ['월세', '임대료', '자취'],
    },
    {
      id: 'n3', category: 'FINANCE', slot: 'SUB',
      title: '청년 자산형성 적금 하반기 가입 신청',
      benefit: '매달 넣은 돈에 정부 기여금 더해 받기',
      audience: { summary: '개인·가구 소득 기준 있음', ageMin: 19, ageMax: 34, incomeLimit: true },
      regions: 'NATIONWIDE', applyStart: d(-3), applyDeadline: d(12), alwaysOpen: false,
      action: '소득 정보 제공 동의를 미리 해 두기',
      source: src('○○금융기관(예시)'), postedAt: d(-1), keywords: ['적금', '저축', '기여금', '자산'],
      calcLink: { to: '/savings', label: '정책 적금 계산해 보기' },
    },
    {
      id: 'n4', category: 'CULTURE', slot: 'SUB',
      title: '청년 문화 이용권 하반기 접수',
      benefit: '공연·전시에 연 최대 10만 원',
      audience: { summary: '그 밖의 조건은 공고문 확인', ageMin: 19, ageMax: 24, incomeLimit: null },
      regions: 'NATIONWIDE', applyStart: d(-14), applyDeadline: d(0), alwaysOpen: false,
      action: '오늘 자정 전에 온라인으로 신청하기',
      source: src('○○재단(예시)'), postedAt: d(-9), keywords: ['문화', '공연', '전시', '이용권'],
    },
    {
      id: 'n5', category: 'JOB',
      title: '구직 청년 면접 정장 무료 대여',
      benefit: '대여비 1회 약 5만 원 아끼기',
      audience: { summary: '경기 거주 구직자', ageMin: 18, ageMax: 39, incomeLimit: null },
      regions: ['경기'], applyStart: null, applyDeadline: null, alwaysOpen: true,
      action: '면접 3일 전까지 대여 예약하기',
      source: src('○○구 일자리센터(예시)'), postedAt: d(-30), keywords: ['면접', '정장', '취업'],
    },
    {
      id: 'n6', category: 'HOUSING',
      title: '전월세 보증금 대출 이자 지원 접수',
      benefit: '대출 이자 연 최대 2%p 지원',
      audience: { summary: '무주택 · 부산 거주 · 소득 기준 있음', ageMin: null, ageMax: null, incomeLimit: true },
      regions: ['부산'], applyStart: null, applyDeadline: null, alwaysOpen: false,
      action: '공고문에서 모집 기간 확인하기',
      source: src('○○도청(예시)'), postedAt: d(-4), keywords: ['전세', '보증금', '대출', '이자'],
    },
    {
      id: 'n7', category: 'TRANSPORT',
      title: '심야 대중교통 청년 할인 시범 운영',
      benefit: '심야 이용 1회 최대 1,000원 할인',
      audience: { summary: '인천 대중교통 이용자', ageMin: 19, ageMax: 29, incomeLimit: null },
      regions: ['인천'], applyStart: d(3), applyDeadline: d(20), alwaysOpen: false,
      action: '시작일에 교통카드 등록하기',
      source: src('○○시 교통공사(예시)'), postedAt: d(0), keywords: ['심야', '버스', '할인'],
    },
    {
      id: 'n8', category: 'TAX',
      title: '중소기업 취업 청년 소득세 감면 신청',
      benefit: '소득세 최대 90% 감면(연 200만 원 한도)',
      audience: { summary: '중소기업 재직', ageMin: 15, ageMax: 34, incomeLimit: null },
      regions: 'NATIONWIDE', applyStart: null, applyDeadline: null, alwaysOpen: true,
      action: '회사에 감면 신청서 내기',
      source: src('○○청(예시)'), postedAt: d(-15), keywords: ['소득세', '감면', '세금', '중소기업'],
    },
    {
      id: 'n9', category: 'CULTURE',
      title: '청년 마음건강 상담 바우처 추가 모집',
      benefit: '상담 8회 지원(본인 부담 일부)',
      audience: { summary: '대구 거주', ageMin: 19, ageMax: 34, incomeLimit: null },
      regions: ['대구'], applyStart: d(-2), applyDeadline: d(9), alwaysOpen: false,
      action: '주민센터나 온라인으로 신청하기',
      source: src('○○시(예시)'), postedAt: d(-3), keywords: ['상담', '마음건강', '바우처'],
    },
    {
      id: 'n10', category: 'JOB',
      title: '청년 일경험 프로그램 참여자 모집',
      benefit: '참여 수당 월 최대 50만 원',
      audience: { summary: '미취업', ageMin: 15, ageMax: 34, incomeLimit: null },
      regions: 'NATIONWIDE', applyStart: d(-7), applyDeadline: d(40), alwaysOpen: false,
      action: '관심 직무를 골라 참여 신청하기',
      source: src('○○부(예시)'), postedAt: d(-7), keywords: ['일경험', '인턴', '수당'],
    },
    {
      id: 'n11', category: 'FINANCE',
      title: '사회초년생 금융 교육 무료 강좌',
      benefit: '수강료 약 3만 원 아끼기',
      audience: { summary: '광주 거주', ageMin: 19, ageMax: 34, incomeLimit: null },
      regions: ['광주'], applyStart: d(-5), applyDeadline: d(6), alwaysOpen: false,
      action: '원하는 강좌 날짜 고르기',
      source: src('○○센터(예시)'), postedAt: d(-5), keywords: ['금융교육', '강좌', '신용'],
    },
    {
      id: 'n12', category: 'HOUSING',
      title: '청년 이사비 지원 접수',
      benefit: '이사비 최대 40만 원',
      audience: { summary: '경기 거주 · 소득 기준 있음', ageMin: 19, ageMax: 39, incomeLimit: true },
      regions: ['경기'], applyStart: d(-30), applyDeadline: d(-2), alwaysOpen: false,
      action: '다음 모집 공고 기다리기',
      source: src('○○시(예시)'), postedAt: d(-20), keywords: ['이사', '이사비'],
    },
    {
      id: 'n13', category: 'CULTURE',
      title: '청년 독서 지원금',
      benefit: '도서 구입비 연 최대 5만 원',
      audience: { summary: '세종 거주', ageMin: 19, ageMax: 29, incomeLimit: null },
      regions: ['세종'], applyStart: d(-1), applyDeadline: d(25), alwaysOpen: false,
      action: '지역 서점 목록 확인하기',
      source: src('○○시(예시)'), postedAt: null, keywords: ['독서', '책', '도서'],
    },
  ];
}

// 승인된 소식(GET /youth-news, backend/README "API"). 서버도 ?age=&region=&category= 필터를 받지만 화면은 전부 받아 브라우저에서 거른다.
// 아직 승인된 소식이 없거나 서버에 닿지 못하면 예시 소식을 "예시" 표시와 함께 보여 준다.
async function fetchNews(): Promise<NewsFeed> {
  try {
    const { items, preview } = await api<{ items: YouthNews[]; preview?: boolean }>('/youth-news');
    if (items.length > 0) return { items, isSample: false, isPreview: preview === true };
  } catch {
    /* 아래 예시로 대신한다 */
  }
  return delay({ items: sampleNews(), isSample: true });
}

export const useNews = () => useQuery({ queryKey: ['news', 'list'], queryFn: fetchNews });
