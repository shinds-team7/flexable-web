// 금융 가이드(/guide)와 카테고리 화면(/guide/:category)의 고정 내용. AI 계획에서 예적금·주식·ETF 등을 고르기 전에 처음 쓰는 사람이 개념을 익히도록 안내한다.
// 설명은 일반적인 상품 구조만 다룬다. 특정 상품 추천·수익 보장·가입 유도는 하지 않는다.
// 콘텐츠 상세(/guide/:category/:id)의 본문은 guideArticles.ts에 id로 따로 둔다. 본문이 없는 콘텐츠는 상세에서 '준비 중'으로 보인다.

export type FinanceArtId = 'books' | 'jar' | 'percent' | 'piggy' | 'pie' | 'wallet' | 'news' | 'calculator' | 'target';

export type GuideCategory = 'basic' | 'product';

export const CATEGORY_LABEL: Record<GuideCategory, string> = { basic: '금융 기초', product: '저축과 투자' };

export const isGuideCategory = (v: string | undefined): v is GuideCategory => v === 'basic' || v === 'product';

/** 카테고리 카드(메인)와 카테고리 화면 머리말 */
export const GUIDE_CATEGORIES: { id: GuideCategory; desc: string[]; lead: string }[] = [
  { id: 'basic', desc: ['금리·이자·복리·세금 등', '금융에 필요한 기초 지식들을 알아봐요.'], lead: '일상에서 꼭 필요한 금융 지식을 쉽게 알아보세요.' },
  { id: 'product', desc: ['예금·CMA·주식·ETF·ISA 등', '돈을 키우는 투자의 기초를 배워봐요.'], lead: '예금부터 ETF까지, 금융상품의 특징과 차이를 알아보세요.' },
];

/** '저축과 투자'(product) 안의 표시용 구분. 글 주소(/guide/product/:id)와 카테고리는 그대로이고, 메인 추천 콘텐츠의 탭과 카드 표시만 이 값으로 나눈다 */
export type GuideTopic = 'saving' | 'investing';

export const TOPIC_LABEL: Record<GuideTopic, string> = { saving: '저축', investing: '투자' };

export type GuideContent = {
  id: string;
  category: GuideCategory;
  /** category가 product인 글만 있다 */
  topic?: GuideTopic;
  title: string;
  desc: string;
  /** 카드 아래 해시태그(# 없이) */
  tag: string;
  minutes: number;
  /** 최신순 정렬용 게시 순서(클수록 최신). 예시 값 */
  order: number;
  /** 카테고리 화면 '꼭 알아야 하는 지식'에 고정 */
  pinned?: boolean;
  art: FinanceArtId;
};

/** 가이드 콘텐츠. 목록은 docs/content-guidelines.md §2를 따른다. 게시 순서는 예시 값이다. 글을 추가하면 조회수 합계 표(guide_content_views)에도 새 마이그레이션으로 줄을 넣는다.
 *  설명(desc)은 원고를 쓸 때 채운다. 읽는 시간(minutes)은 본문 글자 수에 비례해 가장 짧은 글 3분, 가장 긴 글 6분 사이로 매긴 값이다 */
export const GUIDE_CONTENTS: { isSample: true; items: GuideContent[] } = {
  isSample: true,
  items: [
    // 금융 기초 (앞 4개가 '꼭 알아야 하는 지식')
    { id: 'interest-rate', category: 'basic', pinned: true, art: 'percent', tag: '금리', minutes: 6, order: 18, title: '금리와 기준금리', desc: '금리의 뜻과 정해지는 원리, 기준금리가 예금·대출 금리에 주는 영향을 알아봐요.' },
    { id: 'interest-income-tax', category: 'basic', pinned: true, art: 'calculator', tag: '세금', minutes: 4, order: 17, title: '이자소득세', desc: '예금·적금 이자에서 떼는 세금과 세후 이자 계산, 금융소득 2천만 원 기준을 알아봐요.' },
    { id: 'simple-vs-compound', category: 'basic', pinned: true, art: 'jar', tag: '복리', minutes: 3, order: 16, title: '단리 vs 복리', desc: '단리와 복리의 차이를 같은 예시로 비교하고, 상품에서 확인할 점을 알아봐요.' },
    { id: 'inflation-real-rate', category: 'basic', pinned: true, art: 'news', tag: '물가', minutes: 4, order: 15, title: '인플레이션과 실질금리', desc: '물가가 오르면 돈의 가치가 어떻게 변하는지, 명목금리와 실질금리의 차이를 알아봐요.' },
    { id: 'exchange-rate', category: 'basic', art: 'wallet', tag: '환율', minutes: 4, order: 14, title: '환율', desc: '환율의 뜻과 정해지는 원리, 환율이 오를 때 생활에 생기는 변화를 알아봐요.' },
    { id: 'gross-vs-net-pay', category: 'basic', art: 'wallet', tag: '월급', minutes: 5, order: 13, title: '세전 월급 vs 실수령액', desc: '월급에서 떼는 사회보험료와 세금, 실수령액이 줄어드는 이유를 알아봐요.' },
    { id: 'year-end-tax', category: 'basic', art: 'calculator', tag: '연말정산', minutes: 4, order: 12, title: '연말정산', desc: '연말정산으로 세금을 돌려받거나 더 내는 이유와 소득공제·세액공제의 차이를 알아봐요.' },
    { id: 'credit-score', category: 'basic', art: 'target', tag: '신용점수', minutes: 3, order: 11, title: '신용점수', desc: '신용점수가 무엇인지, 어디서 확인하고 어떻게 관리하는지 알아봐요.' },
    { id: 'loan-rate-repayment', category: 'basic', art: 'percent', tag: '대출', minutes: 4, order: 10, title: '대출 금리와 상환 방식', desc: '고정·변동금리와 세 가지 상환 방식의 차이, 대출할 때 알아 둘 권리를 알아봐요.' },
    // 저축과 투자 (앞 4개가 '꼭 알아야 하는 지식')
    { id: 'saving-vs-investing', category: 'product', topic: 'saving', pinned: true, art: 'piggy', tag: '저축·투자', minutes: 4, order: 9, title: '저축 vs 투자', desc: '저축과 투자의 차이, 상품을 고를 때 볼 기준과 비상금의 역할을 알아봐요.' },
    { id: 'deposit-vs-savings', category: 'product', topic: 'saving', pinned: true, art: 'piggy', tag: '예적금', minutes: 4, order: 8, title: '예금 vs 적금', desc: '예금과 적금의 차이, 적금 이자 계산과 우대금리·중도해지·예금자보호를 알아봐요.' },
    { id: 'parking-vs-cma', category: 'product', topic: 'saving', pinned: true, art: 'jar', tag: 'CMA', minutes: 5, order: 7, title: '파킹통장 vs CMA', desc: '수시로 넣고 빼는 돈을 두는 파킹통장과 CMA의 차이, 예금자보호 여부를 알아봐요.' },
    { id: 'housing-subscription', category: 'product', topic: 'saving', pinned: true, art: 'target', tag: '청약', minutes: 4, order: 6, title: '청약통장', desc: '주택청약종합저축의 가입·납입 조건, 소득공제와 예금자보호를 알아봐요.' },
    { id: 'stock-basics', category: 'product', topic: 'investing', art: 'pie', tag: '주식', minutes: 6, order: 5, title: '주식 기초', desc: '주식이 무엇인지, 어떻게 사고파는지와 세금·위험을 알아봐요.' },
    { id: 'kospi-vs-kosdaq', category: 'product', topic: 'investing', art: 'news', tag: '코스피', minutes: 5, order: 4, title: '코스피 vs 코스닥', desc: '두 주식시장의 차이와 주가지수를 계산하는 방식을 알아봐요.' },
    { id: 'bond-basics', category: 'product', topic: 'investing', art: 'books', tag: '채권', minutes: 5, order: 3, title: '채권 기초', desc: '채권의 구조와 종류, 금리에 따라 가격이 바뀌는 이유를 알아봐요.' },
    { id: 'fund-vs-etf', category: 'product', topic: 'investing', art: 'pie', tag: 'ETF', minutes: 6, order: 2, title: '펀드 vs ETF', desc: '펀드와 ETF의 구조, 사고파는 방법, 비용과 세금의 차이를 알아봐요.' },
    { id: 'isa-vs-pension', category: 'product', topic: 'investing', art: 'books', tag: '연금', minutes: 5, order: 1, title: 'ISA vs 연금저축', desc: 'ISA와 연금저축의 세금 혜택, 유지 조건과 찾을 때 주의할 점을 비교해요.' },
  ],
};

/** 메인 추천 콘텐츠의 정렬(추천순이 기본). 조회순은 서버가 센 글별 조회수로 정렬한다. 카테고리 화면은 ContentSort(최신순·많이 본 순)를 그대로 쓴다 */
export type MainSort = 'recommended' | 'latest' | 'popular';
export const MAIN_SORT: Record<MainSort, { label: string; lead: string }> = {
  recommended: { label: '추천순', lead: '금융 공부가 처음이라면 꼭 알아야 할 기초부터 차근차근 시작하세요.' },
  latest: { label: '최신순', lead: '최근에 새로 정리된 금융 지식들을 확인해 보세요.' },
  popular: { label: '조회순', lead: '요즘 관심이 몰리는 금융 지식이 무엇인지 확인해보세요.' },
};

/** 추천순: 탭마다 편집으로 고른 글과 순서. 특정 상품 추천이 아니라 개념 글의 순서다 */
export const RECOMMENDED: Record<'all' | 'basic' | GuideTopic, string[]> = {
  all: ['interest-rate', 'simple-vs-compound', 'saving-vs-investing', 'deposit-vs-savings', 'parking-vs-cma', 'gross-vs-net-pay', 'stock-basics', 'year-end-tax'],
  basic: ['interest-rate', 'simple-vs-compound', 'gross-vs-net-pay', 'year-end-tax'],
  saving: ['deposit-vs-savings', 'parking-vs-cma', 'saving-vs-investing', 'housing-subscription'],
  investing: ['fund-vs-etf', 'stock-basics', 'isa-vs-pension', 'bond-basics'],
};

export const selectRecommended = (items: GuideContent[], key: keyof typeof RECOMMENDED): GuideContent[] => RECOMMENDED[key].flatMap((id) => items.find((c) => c.id === id) ?? []);

export type ContentSort = 'latest' | 'popular';
export const SORT_LABEL: Record<ContentSort, string> = { latest: '최신순', popular: '많이 본 순' };

/** views는 서버가 센 글별 조회수. 조회수가 같으면 recommended에 든 글 먼저, 그것도 같으면 제목 가나다순 */
export function selectContents(items: GuideContent[], cat: GuideCategory | 'all', sort: ContentSort, views: Record<string, number> = {}, recommended: string[] = []): GuideContent[] {
  const notRecommended = (c: GuideContent) => (recommended.includes(c.id) ? 0 : 1);
  return items
    .filter((c) => cat === 'all' || c.category === cat)
    .sort((a, b) => (sort === 'latest' ? b.order - a.order : (views[b.id] ?? 0) - (views[a.id] ?? 0) || notRecommended(a) - notRecommended(b) || a.title.localeCompare(b.title, 'ko')));
}

/** 콘텐츠 제목·설명·태그에 검색어가 들어갔는지(띄어쓰기·대소문자 무시) */
export function contentMatches(c: GuideContent, query: string): boolean {
  const q = norm(query);
  return !q || [c.title, c.desc, c.tag].some((t) => norm(t).includes(q));
}

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

export type GuideSuggestion = { kind: 'term'; label: string } | { kind: 'content'; label: string; content: GuideContent };

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
// 겹모음·겹받침은 입력 순서대로 나눈다(과는 고를 거쳐 입력되므로 ㄱㅗㅏ여야 입력 중에도 이어서 맞는다)
const JUNGSEONG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONGSEONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 완성형 한글을 자음·모음으로 푼다(금 → ㄱㅡㅁ). 띄어쓰기·대소문자는 무시한다 */
const toJamo = (s: string) =>
  norm(s).replace(/[가-힣]/g, (ch) => {
    const n = ch.charCodeAt(0) - 0xac00;
    return CHOSEONG[Math.floor(n / 588)] + JUNGSEONG[Math.floor((n % 588) / 28)] + JONGSEONG[n % 28];
  });

/** label의 어느 글자에서 시작해 입력(자음·모음으로 푼 q)이 이어지는지. 받침 중간부터는 맞추지 않는다 */
const matchesJamo = (label: string, q: string) => {
  const n = norm(label);
  return [...n].some((_, i) => toJamo(n.slice(i)).startsWith(q));
};

/** 검색창 자동완성: 입력 중인 글자도 맞춘다(ㄱ·그·금·금ㄹ → 금리). 이름이 입력으로 시작하는 것 → 이름에 들어간 것 → 비슷한 말·태그로 맞는 것 순(브라우저 안에서만) */
export function suggestGuide(input: string, limit = 8): GuideSuggestion[] {
  const q = toJamo(input);
  if (!q) return [];
  const rank = (label: string) => (toJamo(label).startsWith(q) ? 0 : matchesJamo(label, q) ? 1 : 2);
  const terms = GLOSSARY.filter((g) => [g.term, ...g.aliases].some((t) => matchesJamo(t, q)))
    .sort((a, b) => rank(a.term) - rank(b.term))
    .map((g): GuideSuggestion => ({ kind: 'term', label: g.term }));
  const contents = GUIDE_CONTENTS.items
    .filter((c) => [c.title, c.tag].some((t) => matchesJamo(t, q)))
    .sort((a, b) => rank(a.title) - rank(b.title) || b.order - a.order)
    .map((c): GuideSuggestion => ({ kind: 'content', label: c.title, content: c }));
  return [...terms, ...contents].slice(0, limit);
}

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
