// 금융 가이드(/guide)와 카테고리 화면(/guide/:category)의 고정 내용. AI 계획에서 예적금·주식·ETF 등을 고르기 전에 처음 쓰는 사람이 개념을 익히도록 안내한다.
// 설명은 일반적인 상품 구조만 다룬다. 특정 상품 추천·수익 보장·가입 유도는 하지 않는다.
// 콘텐츠 상세 글은 따로 들어올 예정이라, 지금은 카드(분류·제목·설명·태그)만 보여 주고 상세로 가는 '더보기'는 준비 중으로 둔다.

export type FinanceArtId = 'books' | 'jar' | 'percent' | 'piggy' | 'pie' | 'wallet' | 'news' | 'calculator' | 'target';

export type GuideCategory = 'basic' | 'product';

export const CATEGORY_LABEL: Record<GuideCategory, string> = { basic: '금융 기초', product: '금융 상품' };

export const isGuideCategory = (v: string | undefined): v is GuideCategory => v === 'basic' || v === 'product';

/** 카테고리 카드(메인)와 카테고리 화면 머리말 */
export const GUIDE_CATEGORIES: { id: GuideCategory; desc: string[]; lead: string; art: FinanceArtId }[] = [
  { id: 'basic', desc: ['금리, 이자, 복리, 세금 등', '금융을 이해하는 데 필요한 기본 개념'], lead: '일상에서 꼭 필요한 금융 지식을 쉽게 알아보세요.', art: 'books' },
  { id: 'product', desc: ['예금, 적금, 주식, ETF, 펀드, 채권, CMA 등', '다양한 금융상품의 특징과 차이'], lead: '예금부터 ETF까지, 금융상품의 특징과 차이를 알아보세요.', art: 'jar' },
];

export type GuideContent = {
  id: string;
  category: GuideCategory;
  title: string;
  desc: string;
  /** 카드 아래 해시태그(# 없이) */
  tag: string;
  minutes: number;
  /** 조회수. 집계 서버가 없어 고정 예시 숫자다(isSample) */
  views: number;
  /** 최신순 정렬용 게시 순서(클수록 최신). 예시 값 */
  order: number;
  /** 카테고리 화면 '꼭 알아야 하는 지식'에 고정 */
  pinned?: boolean;
  art: FinanceArtId;
};

/** 가이드 콘텐츠. 조회수·게시 순서는 예시 값이라 화면에 '예시'를 붙인다 */
export const GUIDE_CONTENTS: { isSample: true; items: GuideContent[] } = {
  isSample: true,
  items: [
    // 금융 기초 · 꼭 알아야 하는 지식
    {
      id: 'interest-rate', tag: '금리', category: 'basic', pinned: true, art: 'percent', minutes: 4, views: 12840, order: 16,
      title: '금리란 무엇인가요?', desc: '금리의 의미부터 내 돈에 어떤 영향을 주는지 알아봐요.',
    },
    {
      id: 'simple-compound', tag: '복리', category: 'basic', pinned: true, art: 'jar', minutes: 4, views: 11205, order: 15,
      title: '단리와 복리, 뭐가 다를까?', desc: '이자에 이자가 붙는 복리의 원리를 예시로 알아봐요.',
    },
    {
      id: 'saving-vs-investing', tag: '저축·투자', category: 'basic', pinned: true, art: 'piggy', minutes: 5, views: 10876, order: 14,
      title: '저축과 투자, 어떻게 다를까?', desc: '원금 보장 여부와 기대 수익, 위험의 차이를 정리해요.',
    },
    {
      id: 'tax', tag: '세금', category: 'basic', pinned: true, art: 'calculator', minutes: 4, views: 10421, order: 13,
      title: '이자에 붙는 세금은 얼마일까?', desc: '이자소득세 15.4%와 세후 이자 계산 방법을 알아봐요.',
    },
    // 금융 기초 · 전체 콘텐츠
    {
      id: 'credit-score', tag: '신용점수', category: 'basic', art: 'wallet', minutes: 4, views: 8642, order: 12,
      title: '신용점수, 왜 중요할까요?', desc: '신용점수가 대출, 카드 발급 등에 어떤 영향을 미치는지 알아봐요.',
    },
    {
      id: 'inflation', tag: '물가', category: 'basic', art: 'news', minutes: 4, views: 6318, order: 11,
      title: '물가가 오르면 내 돈은 어떻게 될까?', desc: '인플레이션과 실질 금리의 뜻을 쉽게 알아봐요.',
    },
    {
      id: 'emergency-fund', tag: '비상금', category: 'basic', art: 'jar', minutes: 3, views: 5904, order: 10,
      title: '비상금, 얼마나 모아 두면 좋을까?', desc: '갑작스러운 지출에 대비하는 비상금의 기준을 알아봐요.',
    },
    {
      id: 'split-accounts', tag: '통장관리', category: 'basic', art: 'wallet', minutes: 3, views: 7120, order: 9,
      title: '월급 관리의 첫걸음, 통장 쪼개기', desc: '목적별로 통장을 나눠 돈의 흐름을 한눈에 보는 방법이에요.',
    },
    // 금융 상품 · 꼭 알아야 하는 지식
    {
      id: 'deposit-vs-savings', tag: '예적금', category: 'product', pinned: true, art: 'piggy', minutes: 5, views: 9327, order: 8,
      title: '예금과 적금, 뭐가 다를까?', desc: '두 상품의 차이와 내 상황에 맞는 선택 방법을 알아봐요.',
    },
    {
      id: 'etf-vs-stock', tag: 'ETF', category: 'product', pinned: true, art: 'pie', minutes: 6, views: 15203, order: 7,
      title: 'ETF와 주식, 어떤 점이 다를까?', desc: '투자 대상, 위험도, 수익 구조의 차이를 한눈에 정리해요.',
    },
    {
      id: 'fund', tag: '펀드', category: 'product', pinned: true, art: 'books', minutes: 5, views: 6890, order: 6,
      title: '펀드는 어떻게 굴러갈까?', desc: '여러 사람의 돈을 모아 전문가가 운용하는 구조를 알아봐요.',
    },
    {
      id: 'depositor-protection', tag: '예금자보호', category: 'product', pinned: true, art: 'target', minutes: 4, views: 8015, order: 5,
      title: '예금자보호, 어디까지 될까?', desc: '보호되는 상품과 보호되지 않는 상품을 구분해 봐요.',
    },
    // 금융 상품 · 전체 콘텐츠
    {
      id: 'bond', tag: '채권', category: 'product', art: 'news', minutes: 5, views: 7913, order: 4,
      title: '채권이란 무엇인가요?', desc: '채권의 개념과 특징, 장단점을 쉽게 알아봐요.',
    },
    {
      id: 'cma-parking', tag: 'CMA', category: 'product', art: 'jar', minutes: 4, views: 6402, order: 3,
      title: 'CMA와 파킹통장, 뭐가 다를까?', desc: '잠깐 두는 돈을 어디에 둘지 두 상품을 비교해요.',
    },
    {
      id: 'preferential-rate', tag: '우대금리', category: 'product', art: 'percent', minutes: 3, views: 5718, order: 2,
      title: '적금 우대금리, 꼼꼼히 보는 법', desc: '최고금리 뒤에 숨은 우대조건을 확인하는 방법이에요.',
    },
    {
      id: 'early-termination', tag: '중도해지', category: 'product', art: 'calculator', minutes: 3, views: 4986, order: 1,
      title: '만기 전에 해지하면 어떻게 될까?', desc: '중도해지 금리와 손해를 줄이는 방법을 알아봐요.',
    },
  ],
};

export type ContentSort = 'latest' | 'popular';
export const SORT_LABEL: Record<ContentSort, string> = { latest: '최신순', popular: '많이 본 순' };

export function selectContents(items: GuideContent[], cat: GuideCategory | 'all', sort: ContentSort): GuideContent[] {
  return items.filter((c) => cat === 'all' || c.category === cat).sort((a, b) => (sort === 'latest' ? b.order - a.order : b.views - a.views));
}

/** 콘텐츠 제목·설명·태그에 검색어가 들어갔는지(띄어쓰기·대소문자 무시) */
export function contentMatches(c: GuideContent, query: string): boolean {
  const q = norm(query);
  return !q || [c.title, c.desc, c.tag].some((t) => norm(t).includes(q));
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
    contents: GUIDE_CONTENTS.items.filter((c) => has(c.title, c.desc, CATEGORY_LABEL[c.category])).sort((a, b) => b.order - a.order),
  };
}
