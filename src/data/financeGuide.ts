// 금융 가이드(/guide)와 카테고리 화면(/guide/:category)의 고정 내용. AI 계획에서 예적금·주식·ETF 등을 고르기 전에 처음 쓰는 사람이 개념을 익히도록 안내한다.
// 설명은 일반적인 상품 구조만 다룬다. 특정 상품 추천·수익 보장·가입 유도는 하지 않는다.
// 콘텐츠 상세(/guide/:category/:id)의 본문은 guideArticles.ts에 id로 따로 둔다. 본문이 없는 콘텐츠는 상세에서 '준비 중'으로 보인다.

export type FinanceArtId = 'books' | 'jar' | 'percent' | 'piggy' | 'pie' | 'wallet' | 'news' | 'calculator' | 'target';

export type GuideCategory = 'basic' | 'product';

export const CATEGORY_LABEL: Record<GuideCategory, string> = { basic: '금융 기초', product: '저축과 투자' };

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

/** 가이드 콘텐츠. 목록은 docs/content-guidelines.md §2를 따른다. 조회수·게시 순서는 예시 값이라 화면에 '예시'를 붙인다.
 *  설명(desc)·읽는 시간(minutes)은 원고를 쓸 때 채운다(지금은 비어 있거나 임시 값) */
export const GUIDE_CONTENTS: { isSample: true; items: GuideContent[] } = {
  isSample: true,
  items: [
    // 금융 기초 (앞 4개가 '꼭 알아야 하는 지식')
    { id: 'interest-rate', category: 'basic', pinned: true, art: 'percent', tag: '금리', minutes: 2, views: 12840, order: 18, title: '금리와 기준금리', desc: '금리의 뜻과 정해지는 원리, 기준금리가 예금·대출 금리에 주는 영향을 알아봐요.' },
    { id: 'interest-income-tax', category: 'basic', pinned: true, art: 'calculator', tag: '세금', minutes: 1, views: 10421, order: 17, title: '이자소득세', desc: '예금·적금 이자에서 떼는 세금과 세후 이자 계산, 금융소득 2천만 원 기준을 알아봐요.' },
    { id: 'simple-vs-compound', category: 'basic', pinned: true, art: 'jar', tag: '복리', minutes: 1, views: 11205, order: 16, title: '단리 vs 복리', desc: '단리와 복리의 차이를 같은 예시로 비교하고, 상품에서 확인할 점을 알아봐요.' },
    { id: 'inflation-real-rate', category: 'basic', pinned: true, art: 'news', tag: '물가', minutes: 1, views: 6318, order: 15, title: '인플레이션과 실질금리', desc: '물가가 오르면 돈의 가치가 어떻게 변하는지, 명목금리와 실질금리의 차이를 알아봐요.' },
    { id: 'exchange-rate', category: 'basic', art: 'wallet', tag: '환율', minutes: 2, views: 5402, order: 14, title: '환율', desc: '환율의 뜻과 정해지는 원리, 환율이 오를 때 생활에 생기는 변화를 알아봐요.' },
    { id: 'gross-vs-net-pay', category: 'basic', art: 'wallet', tag: '월급', minutes: 1, views: 7730, order: 13, title: '세전 월급 vs 실수령액', desc: '월급에서 떼는 사회보험료와 세금, 실수령액이 줄어드는 이유를 알아봐요.' },
    { id: 'year-end-tax', category: 'basic', art: 'calculator', tag: '연말정산', minutes: 1, views: 6950, order: 12, title: '연말정산', desc: '연말정산으로 세금을 돌려받거나 더 내는 이유와 소득공제·세액공제의 차이를 알아봐요.' },
    { id: 'credit-score', category: 'basic', art: 'target', tag: '신용점수', minutes: 1, views: 8642, order: 11, title: '신용점수', desc: '신용점수가 무엇인지, 어디서 확인하고 어떻게 관리하는지 알아봐요.' },
    { id: 'loan-rate-repayment', category: 'basic', art: 'percent', tag: '대출', minutes: 1, views: 5120, order: 10, title: '대출 금리와 상환 방식', desc: '고정·변동금리와 세 가지 상환 방식의 차이, 대출할 때 알아 둘 권리를 알아봐요.' },
    // 저축과 투자 (앞 4개가 '꼭 알아야 하는 지식')
    { id: 'saving-vs-investing', category: 'product', pinned: true, art: 'piggy', tag: '저축·투자', minutes: 1, views: 10876, order: 9, title: '저축 vs 투자', desc: '저축과 투자의 차이, 상품을 고를 때 볼 기준과 비상금의 역할을 알아봐요.' },
    { id: 'deposit-vs-savings', category: 'product', pinned: true, art: 'piggy', tag: '예적금', minutes: 1, views: 9327, order: 8, title: '예금 vs 적금', desc: '예금과 적금의 차이, 적금 이자 계산과 우대금리·중도해지·예금자보호를 알아봐요.' },
    { id: 'parking-vs-cma', category: 'product', pinned: true, art: 'jar', tag: 'CMA', minutes: 2, views: 6402, order: 7, title: '파킹통장 vs CMA', desc: '수시로 넣고 빼는 돈을 두는 파킹통장과 CMA의 차이, 예금자보호 여부를 알아봐요.' },
    { id: 'housing-subscription', category: 'product', pinned: true, art: 'target', tag: '청약', minutes: 1, views: 7015, order: 6, title: '청약통장', desc: '주택청약종합저축의 가입·납입 조건, 소득공제와 예금자보호를 알아봐요.' },
    { id: 'stock-basics', category: 'product', art: 'pie', tag: '주식', minutes: 2, views: 8890, order: 5, title: '주식 기초', desc: '주식이 무엇인지, 어떻게 사고파는지와 세금·위험을 알아봐요.' },
    { id: 'kospi-vs-kosdaq', category: 'product', art: 'news', tag: '코스피', minutes: 2, views: 5860, order: 4, title: '코스피 vs 코스닥', desc: '두 주식시장의 차이와 주가지수를 계산하는 방식을 알아봐요.' },
    { id: 'bond-basics', category: 'product', art: 'books', tag: '채권', minutes: 2, views: 7913, order: 3, title: '채권 기초', desc: '채권의 구조와 종류, 금리에 따라 가격이 바뀌는 이유를 알아봐요.' },
    { id: 'fund-vs-etf', category: 'product', art: 'pie', tag: 'ETF', minutes: 2, views: 15203, order: 2, title: '펀드 vs ETF', desc: '펀드와 ETF의 구조, 사고파는 방법, 비용과 세금의 차이를 알아봐요.' },
    { id: 'isa-vs-pension', category: 'product', art: 'books', tag: '연금', minutes: 2, views: 6120, order: 1, title: 'ISA vs 연금저축', desc: 'ISA와 연금저축의 세금 혜택, 유지 조건과 찾을 때 주의할 점을 비교해요.' },
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
