// 금융 가이드 콘텐츠 상세(/guide/:category/:id)의 원고. 키는 financeGuide.ts의 GUIDE_CONTENTS id(slug)다. 작성 규칙: docs/content-guidelines.md
// 상세 화면은 FinanceGuideDetail.tsx 하나(템플릿)이고, 글마다 여기 내용만 더한다. 원고가 없는 콘텐츠는 상세 화면에서 '준비 중'으로 보여 준다.
// 원고마다 status를 둔다. 승인 전(draft) 글은 DRAFT_ARTICLES에, 승인한(published) 글은 PUBLISHED_ARTICLES에 넣는다(타입이 status와 넣은 곳이 맞는지 검사한다).
// draft는 npm run dev에서만 보인다. 운영 빌드에서는 import.meta.env.DEV가 false로 바뀌어 DRAFT_ARTICLES와 그 원고가 번들에서 빠진다.
// 금액 예시는 고정 문구이고 화면에서 계산하지 않는다(ADR-3).
// 문장 안의 **굵게**는 화면에서 굵은 글자로 바꾼다.

/** 계산식 박스의 한 칸(작은 라벨 위, 굵은 값 아래) */
export type CalcTerm = { label: string; value: string };

/** 본문 한 덩어리. 글마다 모양이 달라도 화면 코드는 이 종류만 그린다 */
export type GuideBlock =
  /** 문단 */
  | { type: 'p'; text: string }
  /** 계산식: 칸 사이에 연산자(ops[i]는 terms[i]와 terms[i+1] 사이), 마지막 칸이 결과. 예시 금액·금리는 caption 문구에 '예시'를 적는다 */
  | { type: 'calc'; terms: CalcTerm[]; ops: string[]; caption: string }
  /** 용어 목록(왼쪽 용어, 오른쪽 설명) */
  | { type: 'terms'; items: { term: string; desc: string }[] }
  /** 자주 묻는 질문(답은 늘 펼친 상태) */
  | { type: 'faq'; items: { q: string; a: string }[] };

export type GuideSection = { title: string; blocks: GuideBlock[] };

/** 표지: public/guide/의 이미지 파일(src, 2:1 비율). alt는 화면 읽기용 설명(원본: docs/content-reviews/cover-alt-text.json) */
export type GuideCover = { src: string; alt: string };

export type GuideStatus = 'draft' | 'published';

export type GuideArticle = {
  /** draft: 승인 전(개발 화면에서만 보임), published: 승인 후 공개 */
  status: GuideStatus;
  /** 상세 제목. 없으면 카드 제목을 쓴다 */
  title?: string;
  /** 제목 아래 해시태그 줄. 없으면 카드 태그를 쓴다 */
  hashtags?: string;
  cover?: GuideCover;
  sections: GuideSection[];
  footer?: { notes: string[]; sources: { label: string; url: string }[] };
};

type Draft = GuideArticle & { status: 'draft' };
type Published = GuideArticle & { status: 'published' };

const interestRate: Published = {
  status: 'published',
  title: '금리와 기준금리',
  hashtags: '📖 #금리 #이자 #기준금리',
  cover: { src: '/guide/interest-rate.svg', alt: '동전 두 개로 그린 퍼센트 기호' },
  sections: [
    {
      title: '✏️ 금리가 뭐예요?',
      blocks: [
        { type: 'p', text: '돈을 일정 기간 맡기거나 빌리면 그 대가로 이자가 생겨요. 금리는 이자율이라고도 하며, **원금에 대한 이자의 비율**이에요.' },
        { type: 'p', text: '예를 들어 100만 원을 1년 동안 맡겨 이자 5만 원이 붙었다면(세금 떼기 전), 이자 5만 원은 원금의 5%이니 금리는 5%예요. 거꾸로 한 번에 맡긴 돈의 1년 이자는 원금에 연 금리를 곱해 구할 수 있어요(단리, 세금 떼기 전 기준).' },
        {
          type: 'calc',
          terms: [
            { label: '원금', value: '100만 원' },
            { label: '금리', value: '연 5%' },
            { label: '1년 이자', value: '5만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 1년 동안 한 번에 맡긴 경우, 단리·세금 떼기 전',
        },
      ],
    },
    {
      title: '📈 금리는 어떻게 정해져요?',
      blocks: [
        { type: 'p', text: '금리는 기본적으로 **돈의 수요와 공급**에 따라 정해져요. 돈을 빌리려는 수요가 공급보다 많으면 금리가 오르고, 수요가 공급보다 적으면 금리가 내려가요.' },
        {
          type: 'terms',
          items: [
            { term: '기업 투자', desc: '경기 전망이 좋아져 기업 투자가 늘면 돈에 대한 수요가 늘어 금리가 올라가요.' },
            { term: '가계 소득·소비', desc: '가계 소득이 줄거나 소비가 늘면 돈의 공급이 줄어 금리가 올라요.' },
            { term: '앞으로의 물가', desc: '물가가 오를 것으로 예상되면 받을 이자의 실질 가치가 떨어지므로, 돈을 빌려주는 사람이 더 높은 금리를 요구해요.' },
            { term: '빌리는 사람의 신용', desc: '빌려준 돈을 못 받을 위험이 클수록 금리가 높은 것이 일반적이에요.' },
            { term: '빌리는 기간', desc: '빌리는 기간이 길수록 금리가 높은 것이 일반적이에요.' },
          ],
        },
      ],
    },
    {
      title: '🏦 기준금리는 무슨 역할을 해요?',
      blocks: [
        { type: 'p', text: '기준금리는 **한국은행이 금융기관과 거래할 때 기준이 되는 금리**예요. 한국은행 금융통화위원회가 물가 동향, 국내외 경제 상황, 금융시장 여건 등을 살펴 1년에 8번 결정해요(2026년 11월 확인).' },
        { type: 'p', text: '기준금리가 바뀌면 초단기 금리인 콜금리가 바로 영향을 받고, 이어서 시장금리와 예금·대출 금리가 움직여요. 이런 변화는 결국 실물경제 활동에도 영향을 줘요.' },
        { type: 'p', text: '현재 기준금리는 아래 출처의 ‘한국은행 기준금리 추이’ 페이지에서 확인할 수 있어요. 표 맨 위가 현재 기준금리이고, 금리가 바뀐 날만 나와요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 기준금리가 오르면 예금·대출 금리도 꼭 오르나요?',
              a: 'A. 꼭 그렇지는 않아요. 기준금리 인상은 대체로 예금·대출 금리 상승으로 이어지지만, 반드시 같은 방향으로 움직이는 건 아니에요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액과 금리는 이해를 돕기 위해 정한 숫자로, 현재 실제 금리가 아니에요. 실제 금리는 상품과 시기에 따라 달라요.',
      '*이 콘텐츠는 한국은행 자료와 소득세법을 참고했어요.',
    ],
    sources: [
      { label: '한국은행 기준금리 추이', url: 'https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643' },
      { label: '한국은행 기준금리', url: 'https://www.bok.or.kr/portal/singl/baseRate/progress.do?dataSeCd=01&menuNo=200656' },
      { label: '한국은행: 금리란 무엇일까요?', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?menuNo=200134&nttId=10061677' },
      { label: '한국은행 경제교육: 이자율', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=YNGBGS&nttId=165614&menuNo=200647' },
      { label: '한국은행 경제교육: 금융', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=165638&menuNo=200647' },
      { label: '한국은행 경제강의: 기준금리와 예금·대출 금리', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=10072498&menuNo=200134' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/LSW//lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000821176&lsId=001565&print=print' },
    ],
  },
};

const interestIncomeTax: Published = {
  status: 'published',
  title: '이자소득세',
  hashtags: '📖 #이자소득 #원천징수 #세후이자',
  cover: { src: '/guide/interest-income-tax.svg', alt: '한 조각이 떨어져 나간 동전' },
  sections: [
    {
      title: '✏️ 이자에도 세금이 붙어요',
      blocks: [
        { type: 'p', text: '국내 금융회사에 맡긴 예금·적금에서 받는 이자는 세법상 **이자소득**이에요. 이자소득에는 소득세가 붙어요. 이 글에서는 이 세금을 이자소득세라고 부를게요.' },
        { type: 'p', text: '이자를 주는 금융회사는 이자를 줄 때 **세금을 먼저 떼고** 나머지를 줘요. 이렇게 소득을 주는 쪽이 세금을 미리 떼는 것을 **원천징수**라고 해요.' },
      ],
    },
    {
      title: '💸 얼마나 떼요?',
      blocks: [
        { type: 'p', text: '국내에 사는 개인이 받는 일반 예금·적금 이자에서는 소득세 **14%**를 떼요. 여기에 소득세의 10%인 개인지방소득세가 함께 붙어서, 모두 **15.4%**를 떼요(2026년 11월 확인).' },
        {
          type: 'calc',
          terms: [
            { label: '소득세', value: '14,000원' },
            { label: '지방소득세', value: '1,400원' },
            { label: '세금', value: '15,400원' },
          ],
          ops: ['+', '='],
          caption: '예시 · 세전 이자 10만 원, 일반 예금 이자 기준',
        },
        {
          type: 'calc',
          terms: [
            { label: '세전 이자', value: '100,000원' },
            { label: '세금', value: '15,400원' },
            { label: '받는 이자', value: '84,600원' },
          ],
          ops: ['−', '='],
          caption: '예시 · 위 세금을 뺀 금액',
        },
        { type: 'p', text: '상품에 따라 세금이 없거나 세율이 다른 경우도 있어요. 가입 전에 상품 설명에서 세금 조건을 확인하세요.' },
      ],
    },
    {
      title: '📋 이자가 많으면 달라져요',
      blocks: [
        { type: 'p', text: '이자와 배당을 합친 금융소득(비과세 등은 빼고)이 1년에 **2천만 원**을 넘으면, 2천만 원을 넘는 부분은 다른 소득과 합쳐 종합소득세로 계산해요. 이를 금융소득 종합과세라고 해요(2026년 11월 확인).' },
        { type: 'p', text: '1년 금융소득이 2천만 원 이하라면 금융회사가 원천징수한 것으로 세금 납부가 끝나요. 다만 해외에서 받은 이자·배당처럼 원천징수되지 않은 금융소득은 2천만 원 이하라도 종합과세돼요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 세금이 1천 원도 안 되면 걷지 않나요?',
              a: 'A. 원천징수할 소득세가 1천 원 미만이면 걷지 않는 규정이 있지만, 이자소득에는 이 규정이 적용되지 않아요. 그래서 소득세가 1천 원보다 적다는 이유로 면제되지는 않아요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요. 실제 세금은 상품과 개인 상황에 따라 달라질 수 있어요.',
      '*세율과 2천만 원 기준은 2026년 11월 4일에 확인한 법령(소득세법·지방세법, 각각 2026. 1. 1. 시행)과 국세청 자료 기준이에요. 법이 바뀌면 달라질 수 있어요.',
      '*이 콘텐츠는 국가법령정보센터와 국세청 국세상담센터의 자료를 참고했어요.',
    ],
    sources: [
      { label: '국세상담센터: 금융소득 자주묻는 Q&A', url: 'https://call.nts.go.kr/call/qna/selectQnaInfo.do?mi=1441&ctgId=CTG11775' },
      { label: '소득세법 제16조(이자소득)', url: 'https://www.law.go.kr/법령/소득세법/제16조' },
      { label: '소득세법 제127조(원천징수의무)', url: 'https://www.law.go.kr/법령/소득세법/제127조' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/법령/소득세법/제129조' },
      { label: '소득세법 제14조(과세표준의 계산)', url: 'https://www.law.go.kr/법령/소득세법/제14조' },
      { label: '소득세법 제86조(소액 부징수)', url: 'https://www.law.go.kr/법령/소득세법/제86조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
      { label: '조세특례제한법 제88조의2(비과세종합저축)', url: 'https://www.law.go.kr/법령/조세특례제한법/제88조의2' },
      { label: '조세특례제한법 제91조의18(개인종합자산관리계좌)', url: 'https://www.law.go.kr/법령/조세특례제한법/제91조의18' },
    ],
  },
};

const simpleVsCompound: Published = {
  status: 'published',
  title: '단리 vs 복리',
  hashtags: '📖 #단리 #복리 #월복리',
  cover: { src: '/guide/simple-vs-compound.svg', alt: '일정하게 오르는 직선과 갈수록 가파르게 오르는 곡선' },
  sections: [
    {
      title: '✏️ 단리와 복리가 뭐예요?',
      blocks: [
        { type: 'p', text: '이자를 계산하는 대표적인 방식에는 **단리**와 **복리**가 있어요.' },
        {
          type: 'terms',
          items: [
            { term: '단리', desc: '원금에 대해서만 약속한 금리를 적용해 이자를 계산해요.' },
            { term: '복리', desc: '생긴 이자를 원금에 더하고, 더한 금액을 새 원금으로 삼아 다음 이자를 계산해요. 이자에 대한 이자까지 붙는 셈이에요.' },
          ],
        },
      ],
    },
    {
      title: '🔢 얼마나 달라요?',
      blocks: [
        { type: 'p', text: '100만 원을 연 5%로 2년 동안 맡긴다고 해 볼게요. 단리는 해마다 원금 100만 원에만 이자가 붙어요.' },
        {
          type: 'calc',
          terms: [
            { label: '1년째 이자', value: '5만 원' },
            { label: '2년째 이자', value: '5만 원' },
            { label: '단리 이자', value: '10만 원' },
          ],
          ops: ['+', '='],
          caption: '예시 · 단리, 세금 떼기 전',
        },
        { type: 'p', text: '1년마다 이자를 원금에 더하는 복리라면, 2년째에는 105만 원에 이자가 붙어요.' },
        {
          type: 'calc',
          terms: [
            { label: '1년째 이자', value: '5만 원' },
            { label: '2년째 이자', value: '5만 2,500원' },
            { label: '복리 이자', value: '10만 2,500원' },
          ],
          ops: ['+', '='],
          caption: '예시 · 1년마다 이자를 더하는 복리, 세금 떼기 전',
        },
        { type: 'p', text: '이자를 원금에 더한 뒤부터는 같은 금리라도 복리 이자가 더 많아요. 맡기는 기간이 길수록 이자에 붙는 이자가 쌓여 차이가 커져요.' },
      ],
    },
    {
      title: '🔍 상품을 볼 때 확인할 것',
      blocks: [
        { type: 'p', text: '예금·적금에는 단리 상품도 있고 복리 상품도 있어요. 복리는 이자를 원금에 더하는 주기가 **매달(월복리)**일 수도, **1년**일 수도 있어요.' },
        { type: 'p', text: '겉으로 표시된 금리가 같아도 이자 계산 방식이나 세금에 따라 실제로 받는 이자는 달라져요. 상품별 이자 계산 방식은 아래 출처의 금융감독원 ‘금융상품한눈에’에서 확인할 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 1년만 맡겨도 복리가 단리보다 이자가 많나요?',
              a: 'A. 1년마다 이자를 더하는 복리라면 첫 1년 동안은 단리와 이자가 같아요. 아직 이자를 원금에 더하기 전이기 때문이에요. 매달 이자를 더하는 월복리는 1년 안에도 이자에 이자가 붙어요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액과 금리는 이해를 돕기 위해 정한 숫자로, 현재 실제 금리가 아니에요.',
      '*실제로 받는 이자는 세금, 원 단위 끝수 처리, 상품의 이자 계산 조건에 따라 예시와 다를 수 있어요.',
      '*이 콘텐츠는 한국은행과 금융감독원 금융상품한눈에의 자료를 참고했어요.',
    ],
    sources: [
      { label: '한국은행 경제교육: 이자율', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=YNGBGS&nttId=165614&menuNo=200647' },
      { label: '한국은행 경제교육: 금융', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=165638&menuNo=200647' },
      { label: '금융상품한눈에: 정기예금', url: 'https://finlife.fss.or.kr/finlife/svings/fdrmDpst/list.do?menuNo=700002' },
      { label: '금융상품한눈에: 적금', url: 'https://finlife.fss.or.kr/finlife/svings/fdrmEnty/list.do?menuNo=700003' },
    ],
  },
};

const inflationRealRate: Published = {
  status: 'published',
  title: '인플레이션과 실질금리',
  hashtags: '📖 #인플레이션 #물가 #실질금리',
  cover: { src: '/guide/inflation-real-rate.svg', alt: '점점 작아지는 동전과 위로 향한 화살표' },
  sections: [
    {
      title: '✏️ 인플레이션이 뭐예요?',
      blocks: [
        { type: 'p', text: '일정 기간 동안 물가가 오른 정도를 **물가상승률**이라고 해요. 물가상승률이 0보다 커서 물가가 **지속적으로 오르는 현상**을 인플레이션이라고 불러요. 반대로 물가가 지속적으로 내리는 현상은 디플레이션이에요.' },
        { type: 'p', text: '물가가 오르면 같은 돈으로 살 수 있는 물건이 줄어들어요. 돈의 **구매력**이 떨어지는 거예요.' },
      ],
    },
    {
      title: '📉 명목금리와 실질금리',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '명목금리', desc: '물가 변동을 감안하지 않은 금리예요. 예금할 때 받기로 한 금리가 여기에 해당해요.' },
            { term: '실질금리', desc: '물가 변동을 감안한 금리예요. 대략 명목금리에서 물가상승률을 뺀 값이에요.' },
          ],
        },
        { type: 'p', text: '물가가 오르면 이자로 받은 돈의 가치도 물가가 오른 정도와 비슷하게 떨어져요. 그래서 1년 동안 실제로 얻는 이자의 가치는 대략 명목금리에서 물가상승률을 뺀 만큼이에요.' },
        {
          type: 'calc',
          terms: [
            { label: '명목금리', value: '연 5%' },
            { label: '물가상승률', value: '3%' },
            { label: '실질금리', value: '2%' },
          ],
          ops: ['−', '='],
          caption: '예시 · 1년 기준, 대략적인 계산',
        },
        { type: 'p', text: '예금 금리와 물가상승률이 둘 다 연 5%라면 실질금리는 0이에요. 같은 금리라면 물가상승률이 낮을수록 예금으로 얻는 실질 이자가 늘어나요.' },
      ],
    },
    {
      title: '🎯 한국은행의 물가안정목표',
      blocks: [
        { type: 'p', text: '한국은행은 **소비자물가 상승률(전년 같은 기간 대비) 2%**를 물가안정목표로 정하고 있어요(2026년 11월 확인). 이 목표의 기준인 소비자물가지수는 우리가 소비 생활에서 실제로 사는 상품과 서비스의 가격 수준을 측정한 지표예요.' },
        { type: 'p', text: '한국은행은 물가상승률이 중기적으로 이 목표에 가까워지도록 통화신용정책을 운영해요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 예금 금리보다 물가가 더 많이 오르면 어떻게 되나요?',
              a: 'A. 실질금리가 0보다 낮아져요. 이자를 받아도 원금과 이자를 합친 돈으로 살 수 있는 물건이 맡기기 전보다 줄어들 수 있어요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금리와 물가상승률은 이해를 돕기 위해 정한 숫자로, 현재 실제 수치가 아니에요. 세금은 따로 빼지 않았어요.',
      '*물가안정목표는 2026년 11월 4일 한국은행 페이지에서 확인한 내용이에요. 정부와 협의해 바뀔 수 있어요.',
      '*이 콘텐츠는 한국은행 자료를 참고했어요.',
    ],
    sources: [
      { label: '한국은행 물가안정목표제', url: 'https://www.bok.or.kr/portal/main/contents.do?menuNo=200291' },
      { label: '한국은행 경제교육: 물가와 인플레이션(16)', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=YNGBGS&nttId=165612&menuNo=200647' },
      { label: '한국은행 알기 쉬운 경제이야기: 물가와 인플레이션', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=10082463&menuNo=200647' },
      { label: '한국은행 경제교육: 이자율', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=YNGBGS&nttId=165614&menuNo=200647' },
      { label: '한국은행 경제교육: 금융', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=165638&menuNo=200647' },
    ],
  },
};

const exchangeRate: Published = {
  status: 'published',
  title: '환율',
  hashtags: '📖 #환율 #원화가치 #매매기준율',
  cover: { src: '/guide/exchange-rate.svg', alt: '원화와 달러 동전 사이를 오가는 화살표' },
  sections: [
    {
      title: '✏️ 환율이 뭐예요?',
      blocks: [
        { type: 'p', text: '환율은 우리 돈(원화)과 달러화 같은 **외국 돈의 교환 비율**이에요. 우리나라에서는 1달러의 가격을 원화로 표시해요(엔화는 100엔 기준). ‘1달러당 1,000원’이라면 1달러를 사는 데 1,000원이 든다는 뜻이에요.' },
        {
          type: 'calc',
          terms: [
            { label: '살 돈', value: '100달러' },
            { label: '환율', value: '1,000원' },
            { label: '필요한 원화', value: '10만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 1달러당 1,000원, 수수료 제외',
        },
        {
          type: 'calc',
          terms: [
            { label: '살 돈', value: '100달러' },
            { label: '환율', value: '1,100원' },
            { label: '필요한 원화', value: '11만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 환율이 1달러당 1,100원으로 오른 경우, 수수료 제외',
        },
        { type: 'p', text: '환율이 오르면 같은 달러를 사는 데 원화가 더 많이 들어요. 그래서 **환율 상승은 원화 가치 하락**을, 환율 하락은 원화 가치 상승을 뜻해요.' },
      ],
    },
    {
      title: '📈 환율은 어떻게 정해져요?',
      blocks: [
        { type: 'p', text: '우리나라는 **변동환율제도**를 쓰고 있어요. 1997년 12월 16일부터는 변동 폭 제한 없이, 원화 환율이 외환시장에서 외화의 수요와 공급에 따라 자유롭게 정해져요.' },
        {
          type: 'terms',
          items: [
            { term: '달러 수요', desc: '외국 물건을 수입하거나, 해외여행 경비·유학자금을 보내거나, 해외 주식에 투자할 때 달러를 사려는 수요가 생겨요.' },
            { term: '달러 공급', desc: '수출로 받은 달러를 원화로 바꾸거나, 외국 투자자가 우리나라 주식·채권에 투자하려고 달러를 들여와 원화로 바꾸면 달러가 공급돼요.' },
          ],
        },
        { type: 'p', text: '외화 수요가 공급보다 많으면 환율이 오르고, 공급이 수요보다 많으면 환율이 내려요. 국제수지, 물가 같은 경제 여건과 정치·사회 상황도 환율에 영향을 줘요.' },
      ],
    },
    {
      title: '🧳 환율이 오르면 무엇이 달라져요?',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '수출', desc: '우리나라 제품의 가격경쟁력이 높아져 수출이 늘 수 있어요.' },
            { term: '수입품·물가', desc: '원자재 같은 수입품의 원화 가격이 올라 국내 물가가 오르는 요인이 돼요.' },
            { term: '해외여행·송금', desc: '해외여행을 하거나 유학자금을 보내는 사람의 부담이 늘어요.' },
          ],
        },
        { type: 'p', text: '환율이 내리면 반대 방향의 영향이 나타나요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 은행에서 달러를 살 때와 팔 때 환율이 왜 달라요?',
              a: 'A. 은행은 외화를 거래할 때 기준이 되는 **매매기준율**에 수수료 등을 더하거나 빼서 고객에게 적용할 환율을 정해요. 그래서 내가 달러를 살 때 환율이 팔 때보다 높고, 이 환율은 은행마다 다를 수 있어요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 환율과 금액은 이해를 돕기 위해 정한 숫자로, 현재 실제 환율이 아니에요. 실제로 환전할 때 적용되는 환율은 거래하는 금융회사에서 확인하세요.',
      '*환율제도는 2026년 11월 4일 한국은행 자료에서 확인한 내용이에요.',
      '*이 콘텐츠는 한국은행 자료를 참고했어요.',
    ],
    sources: [
      { label: '한국은행: 환율이란 무엇인가요?', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=10061684&menuNo=200647' },
      { label: '한국은행 알기 쉬운 경제이야기: 쉽게 알아보는 환율 이야기', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?menuNo=200646&nttId=10082468' },
      { label: '한국은행 경제교육: 환율과 환율변동의 경제적 영향', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=165617&menuNo=200648' },
      { label: '한국은행 민원FAQ: 외환', url: 'https://www.bok.or.kr/portal/bbs/P0001949/list.do?menuNo=200658&searchOptn2=3' },
    ],
  },
};

const grossVsNetPay: Published = {
  status: 'published',
  title: '세전 월급 vs 실수령액',
  hashtags: '📖 #실수령액 #사회보험료 #원천징수',
  cover: { src: '/guide/gross-vs-net-pay.svg', alt: '마지막 줄이 강조된 급여명세서와 동전' },
  sections: [
    {
      title: '✏️ 세전 월급과 실수령액은 뭐가 달라요?',
      blocks: [
        { type: 'p', text: '세전 월급은 아무것도 떼기 전의 월급이에요. 회사는 월급을 줄 때 **사회보험료 중 근로자가 낼 몫**과 **소득세·지방소득세**를 먼저 떼고 나머지를 줘요. 이렇게 실제로 통장에 들어오는 돈을 실수령액이라고 불러요.' },
      ],
    },
    {
      title: '💳 월급에서 떼는 보험료',
      blocks: [
        { type: 'p', text: '2026년 기준으로 근로자가 내는 몫은 아래와 같아요(2026년 11월 확인).' },
        {
          type: 'terms',
          items: [
            { term: '국민연금', desc: '기준소득월액의 **4.75%**예요. 보험료율 9.5%를 회사와 절반씩 나눠요.' },
            { term: '건강보험', desc: '보수월액의 **3.595%**예요. 보험료율 7.19%를 회사와 절반씩 나눠요.' },
            { term: '장기요양보험', desc: '건강보험료에 **13.14%**를 곱한 금액이 함께 붙어요.' },
            { term: '고용보험', desc: '보수의 **0.9%**예요. 실업급여 보험료율 1.8%의 절반이에요.' },
          ],
        },
        {
          type: 'calc',
          terms: [
            { label: '세전 월급', value: '300만 원' },
            { label: '국민연금', value: '4.75%' },
            { label: '연금보험료', value: '142,500원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 기준소득월액이 월급과 같다고 가정, 2026년 근로자 몫',
        },
        {
          type: 'calc',
          terms: [
            { label: '세전 월급', value: '300만 원' },
            { label: '건강보험', value: '3.595%' },
            { label: '건강보험료', value: '107,850원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 보수월액이 월급과 같다고 가정, 원 단위 끝수 처리 전',
        },
        {
          type: 'calc',
          terms: [
            { label: '건강보험료', value: '107,850원' },
            { label: '장기요양', value: '13.14%' },
            { label: '장기요양보험료', value: '약 14,171원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 위 건강보험료 기준, 계산 방식에 따라 1원 안팎 차이',
        },
        {
          type: 'calc',
          terms: [
            { label: '세전 월급', value: '300만 원' },
            { label: '고용보험', value: '0.9%' },
            { label: '고용보험료', value: '27,000원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 보수가 월급과 같다고 가정',
        },
        { type: 'p', text: '보험료율은 바뀔 수 있어요. 국민연금 보험료율은 2026년부터 해마다 0.5%p씩 올라 2033년에 13%가 될 예정이에요.' },
      ],
    },
    {
      title: '🧾 세금은 어떻게 떼요?',
      blocks: [
        { type: 'p', text: '회사는 매달 월급을 줄 때 **근로소득 간이세액표**에 정해진 금액만큼 소득세를 떼요(원천징수). 여기에 소득세의 10%인 지방소득세가 함께 붙어요.' },
        {
          type: 'calc',
          terms: [
            { label: '소득세', value: '5만 원' },
            { label: '지방소득세', value: '10%' },
            { label: '지방소득세액', value: '5,000원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 소득세 5만 원은 가정한 숫자예요(실제 금액은 간이세액표로 정해져요)',
        },
        { type: 'p', text: '그리고 다음 해 2월분 월급을 줄 때 1년 동안의 소득으로 세금을 다시 계산해, 매달 뗀 세금과의 차이를 정산해요. 이것이 연말정산이에요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 매달 떼는 소득세를 조절할 수 있나요?',
              a: 'A. 근로자가 신청하면 간이세액표 금액의 **80%** 또는 **120%**로 뗄 수 있어요. 다만 1년 치 세금은 연말정산 때 다시 계산하므로, 매달 덜 떼면 연말정산 때 더 낼 수 있어요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요. 실제 공제액은 급여명세서에서 확인하세요.',
      '*보험료율과 세율은 2026년 11월 4일에 확인한 법령과 보건복지부·국민연금공단·국민건강보험공단 자료 기준이에요. 해마다 바뀔 수 있어요.',
      '*이 콘텐츠는 국가법령정보센터, 보건복지부, 국민연금공단, 국민건강보험공단의 자료를 참고했어요.',
    ],
    sources: [
      { label: '국민연금공단: 국민연금 제도 FAQ', url: 'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0095M0.do' },
      { label: '보건복지부: 2026년 건강보험료율 7.19%로 결정', url: 'http://www.mohw.go.kr/board.es?mid=a10503000000&bid=0027&list_no=1487279&act=view' },
      { label: '보건복지부: 2026년도 장기요양보험료율 0.9448%', url: 'https://www.mohw.go.kr/board.es?act=view&bid=0027&list_no=1487817&mid=a10503000000' },
      { label: '국민건강보험공단: 2026년도 보험료율 기준 안내', url: 'https://www.nhis.or.kr/nhis/together/wbhaea01000m01.do?mode=view&articleNo=11008009' },
      { label: '국민연금법 제90조(원천공제 납부)', url: 'https://www.law.go.kr/법령/국민연금법/제90조' },
      { label: '국민건강보험법 제69조(보험료)', url: 'https://www.law.go.kr/법령/국민건강보험법/제69조' },
      { label: '국민건강보험법 제76조(보험료의 부담)', url: 'https://www.law.go.kr/법령/국민건강보험법/제76조' },
      { label: '고용보험료징수법 제13조(보험료)', url: 'https://www.law.go.kr/법령/고용보험및산업재해보상보험의보험료징수등에관한법률/제13조' },
      { label: '고용보험료징수법 시행령 제12조(고용보험료율)', url: 'https://www.law.go.kr/법령/고용보험및산업재해보상보험의보험료징수등에관한법률시행령/제12조' },
      { label: '소득세법 제134조(근로소득 원천징수)', url: 'https://www.law.go.kr/법령/소득세법/제134조' },
      { label: '소득세법 시행령 제194조(간이세액표의 적용)', url: 'https://www.law.go.kr/법령/소득세법시행령/제194조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
    ],
  },
};

const yearEndTax: Published = {
  status: 'published',
  title: '연말정산',
  hashtags: '📖 #연말정산 #환급 #세액공제',
  cover: { src: '/guide/year-end-tax.svg', alt: '마지막 칸이 강조된 달력과 돌아오는 동전' },
  sections: [
    {
      title: '✏️ 연말정산이 뭐예요?',
      blocks: [
        { type: 'p', text: '회사는 매달 월급을 줄 때 근로소득 간이세액표에 정해진 금액만큼 소득세를 떼요. 그리고 **다음 해 2월분 월급**을 줄 때 1년 동안의 소득으로 세금을 다시 계산해, 매달 뗀 세금과의 차이를 정산해요. 이것이 연말정산이에요.' },
        { type: 'p', text: '중간에 회사를 그만두면 퇴직하는 달 월급을 줄 때 정산해요.' },
      ],
    },
    {
      title: '💰 돌려받을까, 더 낼까?',
      blocks: [
        { type: 'p', text: '1년 동안 실제로 내야 할 세금(**결정세액**)에서 매달 이미 낸 세금(**기납부세액**)을 빼서 결과를 봐요.' },
        {
          type: 'calc',
          terms: [
            { label: '결정세액', value: '100만 원' },
            { label: '이미 낸 세금', value: '120만 원' },
            { label: '결과', value: '−20만 원' },
          ],
          ops: ['−', '='],
          caption: '예시 · 결과가 마이너스면 그만큼 돌려받아요',
        },
        { type: 'p', text: '이미 낸 세금이 더 많으면 그 차이를 돌려받고(환급), 결정세액이 더 많으면 그 차이를 더 내요(추가 납부).' },
      ],
    },
    {
      title: '🧮 소득공제와 세액공제',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '소득공제', desc: '세금을 매기는 기준 금액(**과세표준**)을 줄여요.' },
            { term: '세액공제', desc: '과세표준에 세율을 적용해 나온 세금(**산출세액**)에서 바로 빼요.' },
          ],
        },
        { type: 'p', text: '공제를 받으려면 근로자가 다음 해 2월분 월급을 받기 전에 회사에 **소득·세액 공제신고서**를 내야 해요. 내지 않으면 본인에 대한 기본공제와 표준세액공제만 적용돼요.' },
        { type: 'p', text: '국세청 홈택스의 ‘연말정산 간소화 서비스’에서 의료비·교육비 같은 공제 증명자료를 한 번에 조회할 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 간소화 서비스에 나온 자료는 그대로 공제받으면 되나요?',
              a: 'A. 아니요. 학교, 병·의원, 카드회사 등이 낸 자료를 그대로 보여 주는 것이라 공제 대상이 아닌 자료가 섞여 있을 수 있어요. 공제 요건은 근로자가 직접 확인해야 해요. 간소화 서비스에 없거나 빠진 자료는 발급기관에서 직접 받아 회사에 내면 공제받을 수 있어요.',
            },
            {
              q: 'Q. 더 낼 세금이 많으면 한 번에 내야 하나요?',
              a: 'A. 추가로 낼 세금이 10만 원을 넘으면, 회사가 2월분부터 4월분 월급까지 나누어 뗄 수 있어요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요. 실제 세금은 소득과 공제 내용에 따라 달라요.',
      '*제도 내용은 2026년 11월 4일에 확인한 소득세법(2026. 1. 1. 시행)과 국세청 자료 기준이에요.',
      '*이 콘텐츠는 국가법령정보센터와 국세청의 자료를 참고했어요.',
    ],
    sources: [
      { label: '국세청: 연말정산 세액계산방법', url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7870&mi=6434' },
      { label: '국세청 보도자료: 연말정산 간소화 서비스 개통(2026. 1. 14.)', url: 'https://www.nts.go.kr/nts/na/ntt/selectNttInfo.do?mi=2201&bbsId=1028&nttSn=1347979' },
      { label: '소득세법 제134조(근로소득 원천징수)', url: 'https://www.law.go.kr/법령/소득세법/제134조' },
      { label: '소득세법 제137조(근로소득세액의 연말정산)', url: 'https://www.law.go.kr/법령/소득세법/제137조' },
      { label: '소득세법 제140조(근로소득자의 소득공제 등 신고)', url: 'https://www.law.go.kr/법령/소득세법/제140조' },
    ],
  },
};

const creditScore: Published = {
  status: 'published',
  title: '신용점수',
  hashtags: '📖 #신용점수 #신용평점 #연체',
  cover: { src: '/guide/credit-score.svg', alt: '높은 구간을 가리키는 반원형 점수 계기판' },
  sections: [
    {
      title: '✏️ 신용점수가 뭐예요?',
      blocks: [
        { type: 'p', text: '신용점수는 빚을 어떻게 갚아 왔는지, 지금 빚이 얼마나 있는지, 소득 같은 경제 능력은 어떤지 등을 따져 **1~1,000점**으로 나타낸 거예요.' },
        { type: 'p', text: '2021년 1월 1일부터 개인신용평가회사(신용조회회사, CB사)는 신용등급(1~10등급)을 산정하지 않고 **신용점수만** 산정해요. 금융회사는 이 점수 등을 바탕으로 대출을 해 줄지, 금리를 얼마로 할지 정해요.' },
      ],
    },
    {
      title: '🔍 내 신용 정보 확인하기',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '신용점수', desc: '신용조회회사인 나이스평가정보(NICE)와 코리아크레딧뷰로(KCB)에서 **1년에 3번(4개월마다)** 무료로 조회할 수 있어요(2026년 11월 확인).' },
            { term: '대출·연체 정보', desc: '한국신용정보원 ‘본인신용정보 열람서비스’에서 무료로 조회할 수 있어요.' },
          ],
        },
      ],
    },
    {
      title: '📈 신용점수 관리 방법',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '연체하지 않기', desc: '연체 정보는 신용평가에 가장 치명적이에요. 소액이라도 연체하지 않도록 통장 잔액을 미리 확인하거나 자동이체를 이용하세요.' },
            { term: '오래된 연체부터', desc: '연체 기간이 길수록 불리하므로, 연체가 있다면 가장 오래된 것부터 갚는 게 좋아요.' },
            { term: '대출은 신중하게', desc: '인터넷·전화 대출은 연체 위험도가 높게 평가돼, 연체가 없어도 신용도가 내려갈 수 있어요.' },
          ],
        },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'Q. 신용점수를 조회하면 점수가 떨어지나요?',
              a: 'A. 아니요. 신용평점을 조회하더라도 신용평점에는 영향을 주지 않아요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*제도 내용은 2026년 11월 4일에 확인한 금융위원회·금융감독원·기획재정부 자료 기준이에요. 무료 조회 횟수 같은 조건은 바뀔 수 있어요.',
      '*이 콘텐츠는 금융위원회, 금융감독원, 기획재정부의 자료를 참고했어요.',
    ],
    sources: [
      { label: '금융위원회: 21.1.1일부터는 신용점수로 자신의 신용을 확인하세요(2020. 12. 28.)', url: 'https://www.fsc.go.kr/no010101/75101' },
      { label: '금융감독원: 신용정보조회', url: 'https://law.fss.or.kr/main/prc/lo/sub/lo007.jsp?menuNo=900291' },
      { label: '금융감독원 파인: 신용정보조회(일반/보험신용정보)', url: 'https://fine.fss.or.kr/fine/main/contents.do?menuNo=900036' },
      { label: '금융위원회: 사회초년생을 위한 신용점수 관리방법 7가지(2024. 7. 1.)', url: 'https://www.korea.kr/multi/visualNewsView.do?newsId=148930941' },
      { label: '기획재정부: 당신을 위한 신용관리 A to Z(2022. 6. 22.)', url: 'https://www.korea.kr/multi/visualNewsView.do?newsId=148902750' },
    ],
  },
};

const loanRateRepayment: Published = {
  status: 'published',
  title: '대출 금리와 상환 방식',
  hashtags: '📖 #대출금리 #고정금리 #상환방식',
  cover: { src: '/guide/loan-rate-repayment.svg', alt: '점점 낮아지는 막대와 동전' },
  sections: [
    {
      title: '✏️ 고정금리와 변동금리',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '고정금리', desc: '대출에 적용되는 금리가 계약 기간 동안 변하지 않아요.' },
            { term: '변동금리', desc: '금리가 일정한 주기마다 바뀌어요.' },
            { term: '혼합형', desc: '일정 기간 고정금리를 적용한 뒤 변동금리로 바뀌어요.' },
          ],
        },
        { type: 'p', text: '시장금리가 **내려갈 것으로 예상**되면 변동금리가 유리해요. 고정금리 대출의 금리는 그대로지만 변동금리 대출의 금리는 내려가기 때문이에요. 반대로 시장금리가 **올라갈 것으로 예상**되면 고정금리가 유리해요.' },
      ],
    },
    {
      title: '💳 대출을 갚는 세 가지 방식',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '만기일시상환', desc: '매달 이자만 내다가 만기에 원금을 한꺼번에 갚아요.' },
            { term: '원리금균등분할상환', desc: '원금과 이자를 합해 매달 같은 금액을 갚아요.' },
            { term: '원금균등분할상환', desc: '매달 같은 원금과 함께, 전달 남은 원금에 비례한 이자를 갚아요. 처음에 갚는 금액이 가장 많고 점점 줄어요.' },
          ],
        },
        { type: 'p', text: '금리가 같다면 분할상환이 만기일시상환보다 **총 이자가 적고**, 원금을 조금씩 갚아 나가 만기에 목돈이 필요 없어요. 대신 매달 원금도 함께 갚아야 해서 대출 기간 중 부담은 더 커요.' },
        {
          type: 'calc',
          terms: [
            { label: '대출금', value: '1,200만 원' },
            { label: '금리', value: '연 5%' },
            { label: '1년 이자', value: '60만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 1년 만기일시상환, 고정금리',
        },
        { type: 'p', text: '같은 조건(예시)을 12개월 동안 나눠 갚으면 총 이자는 원리금균등분할상환이 **약 32만 7,477원**, 원금균등분할상환이 **32만 5,000원**이에요. 원금균등분할상환은 첫 달에 105만 원을 내고, 마지막 달에는 약 100만 4,167원을 내요.' },
      ],
    },
    {
      title: '🙋 알아 두면 좋은 권리',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '금리인하요구권', desc: '은행에서 대출을 받은 뒤 재산이 늘거나 개인신용평점이 오르는 등 신용상태가 좋아지면, 은행에 금리를 내려 달라고 요구할 수 있어요.' },
            { term: '중도상환수수료', desc: '대출을 만기 전에 갚을 때 내는 수수료예요. 대출 계약일부터 **3년 이내**에 갚는 경우 등 법에서 정한 경우에만 물릴 수 있어요.' },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액과 금리는 이해를 돕기 위해 정한 숫자로, 현재 실제 금리가 아니에요. 실제 상환액은 상품의 계산 방식과 끝수 처리에 따라 조금 다를 수 있어요.',
      '*실제 대출 조건(금리, 상환 방식, 수수료)은 상품마다 달라요. 계약 전에 금융회사의 상품설명서를 확인하세요.',
      '*제도 내용은 2026년 11월 4일에 확인한 법령과 금융감독원 자료 기준이에요.',
    ],
    sources: [
      { label: '금융상품한눈에: 주택담보대출(용어설명)', url: 'https://finlife.fss.or.kr/finlife/ldng/houseMrtg/list.do?menuNo=700007' },
      { label: '은행법 제30조의2(금리인하 요구)', url: 'https://www.law.go.kr/법령/은행법/제30조의2' },
      { label: '금융소비자보호법 제20조(불공정영업행위의 금지)', url: 'https://www.law.go.kr/법령/금융소비자보호법/제20조' },
    ],
  },
};

/** 승인한 글. 운영 화면에 보인다 */
const PUBLISHED_ARTICLES: Partial<Record<string, Published>> = {
  'interest-rate': interestRate,
  'interest-income-tax': interestIncomeTax,
  'simple-vs-compound': simpleVsCompound,
  'inflation-real-rate': inflationRealRate,
  'exchange-rate': exchangeRate,
  'gross-vs-net-pay': grossVsNetPay,
  'year-end-tax': yearEndTax,
  'credit-score': creditScore,
  'loan-rate-repayment': loanRateRepayment,
};

/** 승인 전 글. npm run dev에서만 보이고 운영 번들에는 들어가지 않는다 */
const DRAFT_ARTICLES: Partial<Record<string, Draft>> = {};

export const GUIDE_ARTICLES: Partial<Record<string, GuideArticle>> = import.meta.env.DEV ? { ...PUBLISHED_ARTICLES, ...DRAFT_ARTICLES } : PUBLISHED_ARTICLES;
