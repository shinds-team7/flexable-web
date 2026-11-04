// 금융 가이드(/guide) 화면의 고정 내용. AI 계획에서 예적금·주식·ETF 등을 고르기 전에 처음 쓰는 사람이 개념을 익히도록 안내한다.
// 설명은 일반적인 상품 구조만 다룬다. 특정 상품 추천·수익 보장·가입 유도는 하지 않는다.
// 콘텐츠 상세 글은 아직 없어서, 콘텐츠를 누르면 이 화면의 용어 설명(검색 결과)을 연다.

export type FinanceArtId = 'books' | 'jar' | 'percent' | 'piggy' | 'pie' | 'wallet' | 'news' | 'calculator';

export type GuideCategory = 'basic' | 'product';

export const CATEGORY_LABEL: Record<GuideCategory, string> = { basic: '금융 기초', product: '금융 상품' };

/** 카테고리 카드. 누르면 추천 콘텐츠를 그 카테고리로 거른다 */
export const GUIDE_CATEGORIES: { id: GuideCategory; desc: string[]; art: FinanceArtId }[] = [
  { id: 'basic', desc: ['금리, 이자, 복리, 세금 등', '금융을 이해하는 데 필요한 기본 개념'], art: 'books' },
  { id: 'product', desc: ['예금, 적금, 주식, ETF, 펀드, 채권, CMA 등', '다양한 금융상품의 특징과 차이'], art: 'jar' },
];

export type GuideContent = {
  id: string;
  category: GuideCategory;
  title: string;
  desc: string;
  minutes: number;
  /** 조회수. 집계 서버가 없어 고정 예시 숫자다(isSample) */
  views: number;
  /** 최신순 정렬용 게시 순서(클수록 최신). 예시 값 */
  order: number;
  /** 누르면 이 검색어로 용어 설명을 연다 */
  keyword: string;
  art: FinanceArtId;
};

/** 추천 콘텐츠. 조회수·게시 순서는 예시 값이라 화면에 '예시'를 붙인다 */
export const GUIDE_CONTENTS: { isSample: true; items: GuideContent[] } = {
  isSample: true,
  items: [
    { id: 'interest-rate', category: 'basic', title: '금리란 무엇인가요?', desc: '금리의 의미부터 내 돈에 어떤 영향을 주는지 알아봐요.', minutes: 4, views: 12840, order: 6, keyword: '금리', art: 'percent' },
    { id: 'deposit-vs-savings', category: 'product', title: '예금과 적금, 뭐가 다를까?', desc: '두 상품의 차이와 내 상황에 맞는 선택 방법을 알아봐요.', minutes: 5, views: 9327, order: 5, keyword: '적금', art: 'piggy' },
    { id: 'etf-vs-stock', category: 'product', title: 'ETF와 주식, 어떤 점이 다를까?', desc: '투자 대상, 위험도, 수익 구조의 차이를 한눈에 정리해요.', minutes: 6, views: 15203, order: 4, keyword: 'ETF', art: 'pie' },
    { id: 'credit-score', category: 'basic', title: '신용점수, 왜 중요할까요?', desc: '신용점수가 대출, 카드 발급 등에 어떤 영향을 미치는지 알아봐요.', minutes: 4, views: 8642, order: 3, keyword: '신용점수', art: 'wallet' },
    { id: 'bond', category: 'product', title: '채권이란 무엇인가요?', desc: '채권의 개념과 특징, 장단점을 쉽게 알아봐요.', minutes: 5, views: 7913, order: 2, keyword: '채권', art: 'news' },
    { id: 'tax', category: 'basic', title: '세금은 어떻게 계산될까?', desc: '이자에 붙는 세금의 원리와 세후 금액 계산 방법을 알아봐요.', minutes: 6, views: 10421, order: 1, keyword: '세금', art: 'calculator' },
  ],
};

export type ContentSort = 'latest' | 'popular';
export const SORT_LABEL: Record<ContentSort, string> = { latest: '최신순', popular: '인기순' };

export function selectContents(items: GuideContent[], cat: GuideCategory | 'all', sort: ContentSort): GuideContent[] {
  return items.filter((c) => cat === 'all' || c.category === cat).sort((a, b) => (sort === 'latest' ? b.order - a.order : b.views - a.views));
}

/** 배너 검색창 아래 추천 검색어 */
export const SUGGESTED_KEYWORDS = ['예금', '적금', '금리', '신용점수', 'ETF', '세금'];

export type GlossaryTerm = { term: string; aliases: string[]; desc: string; note?: string };

/** 검색으로 찾는 기본 용어 설명. 일반적인 구조만 적고 특정 상품 추천·수익 보장은 하지 않는다 */
export const GLOSSARY: GlossaryTerm[] = [
  { term: '예금', aliases: ['정기예금', '목돈'], desc: '목돈을 한 번에 맡겨 두고, 정한 기간이 끝나면 원금과 이자를 받는 상품이에요.', note: '은행·저축은행 예금은 금융회사당 1인 기준 원금과 이자를 합쳐 1억 원까지 보호돼요.' },
  { term: '적금', aliases: ['정기적금', '자유적금', '저축'], desc: '매달 정해진 돈을 꾸준히 넣어 만기에 원금과 이자를 한꺼번에 받는 상품이에요.', note: '넣은 기간만큼만 이자가 붙어서, 같은 금리라도 예금보다 이자가 적어 보여요.' },
  { term: '금리', aliases: ['이자율', '이율', '기준금리', '이자'], desc: '돈을 맡기거나 빌릴 때 붙는 이자의 비율이에요. 보통 1년 기준(연 %)으로 표시해요.', note: '상품의 기본금리와 우대조건을 채웠을 때의 최고금리를 같이 보세요.' },
  { term: '단리와 복리', aliases: ['단리', '복리', '월복리'], desc: '단리는 원금에만 이자가 붙고, 복리는 이미 붙은 이자에도 다시 이자가 붙어요.' },
  { term: '신용점수', aliases: ['신용등급', '신용', '대출'], desc: '금융회사가 대출·카드 심사 때 참고하는 신용도 점수예요(1~1000점). 신용평가회사가 금융 거래 기록을 바탕으로 매겨요.', note: '연체 없이 꾸준히 거래한 기록이 쌓이면 도움이 돼요.' },
  { term: 'ETF', aliases: ['상장지수펀드', '지수', '인덱스'], desc: '코스피200 같은 지수의 움직임을 따라가도록 만든 펀드를, 주식처럼 거래소에서 사고파는 상품이에요.', note: '가격이 오르내려 원금이 줄 수 있고, 예금자보호 대상이 아니에요.' },
  { term: '주식', aliases: ['종목', '코스피', '코스닥', '투자'], desc: '회사의 지분 일부를 사는 거예요. 회사 가치와 시장 상황에 따라 가격이 오르내려요.', note: '원금이 줄 수 있고, 예금자보호 대상이 아니에요.' },
  { term: '펀드', aliases: ['공모펀드', '운용사'], desc: '여러 사람의 돈을 모아 자산운용사가 주식·채권 등에 나눠 투자하는 상품이에요.', note: '운용 결과에 따라 원금이 줄 수 있고, 보수(수수료)가 있어요.' },
  { term: '채권', aliases: ['국채', '회사채'], desc: '나라나 회사가 돈을 빌리면서 발행하는 증서예요. 정해진 날에 이자와 원금을 돌려받아요.', note: '발행한 곳이 갚지 못할 위험이 있고, 만기 전에 팔면 금리 변화에 따라 가격이 달라져요.' },
  { term: 'CMA', aliases: ['종합자산관리계좌', '증권사 통장'], desc: '증권사에 돈을 맡기면 채권 등에 투자해 그 수익을 이자처럼 나눠 주는 통장이에요. 입출금이 자유로운 편이에요.', note: '종류에 따라 예금자보호 대상이 아닐 수 있어요.' },
  { term: '파킹통장', aliases: ['파킹', '비상금', '입출금'], desc: '잠깐 넣어 두어도 이자가 붙고, 언제든 넣고 뺄 수 있는 통장이에요.', note: '높은 금리를 주는 금액에 한도가 있는 상품이 있어요.' },
  { term: '세금(이자소득세)', aliases: ['세금', '이자소득세', '세후', '비과세'], desc: '예금·적금 이자에는 보통 이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)가 떼어져요.', note: '이 서비스의 이자 계산은 세금을 뺀 세후 금액으로 보여 드려요.' },
];

export type GuideSearchResult = { terms: GlossaryTerm[]; contents: GuideContent[] };

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 이 화면 안의 용어 설명·콘텐츠에서 검색어가 들어간 것을 찾는다(브라우저 안에서만, 검색어는 저장·전송하지 않음) */
export function searchGuide(query: string): GuideSearchResult {
  const q = norm(query);
  if (!q) return { terms: [], contents: [] };
  const has = (...texts: string[]) => texts.some((t) => norm(t).includes(q));
  return {
    terms: GLOSSARY.filter((g) => has(g.term, ...g.aliases) || g.aliases.some((a) => q.includes(norm(a)))),
    contents: GUIDE_CONTENTS.items.filter((c) => has(c.title, c.desc, CATEGORY_LABEL[c.category])),
  };
}
