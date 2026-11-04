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
  /** 자주 묻는 질문(답은 늘 펼친 상태). 질문 앞 번호(1️⃣ 2️⃣)는 화면이 붙인다. mark는 답 앞 표시: yes ✅(네로 시작), no ❌(아니요로 시작), tip 💡(설명형, 기본값) */
  | { type: 'faq'; items: { q: string; a: string; mark?: 'yes' | 'no' | 'tip' }[] };

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
  cover: { src: '/guide/interest-rate.png', alt: '동전 두 개로 그린 퍼센트 기호' },
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
      title: '🧭 자주 보는 금리 용어',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '고정금리', desc: '대출 기간 동안 금리가 변하지 않고 일정하게 유지돼요. 시장금리가 바뀌는 위험은 은행이 져요.' },
            { term: '변동금리', desc: '대출 기간 동안 일정 기간마다 금리가 바뀌어요. 금리가 바뀌는 위험은 대출받은 사람이 져요.' },
            { term: '명목금리', desc: '물가 변동을 감안하지 않은 금리예요. 예금할 때 받기로 한 금리가 여기에 해당해요.' },
            { term: '실질금리', desc: '물가 변동을 감안한 금리로, 대략 명목금리에서 물가상승률을 뺀 값이에요. 예를 들어 명목금리가 연 5%, 물가상승률이 3%라면 실질금리는 약 2%예요.' },
            { term: '표면금리', desc: '상품에 겉으로 나타난 금리예요.' },
            { term: '실효금리', desc: '실제로 받거나 부담하게 되는 금리예요.' },
            { term: '콜금리', desc: '만기가 대개 하루인 초단기 금리예요. 기준금리가 바뀌면 바로 영향을 받아요.' },
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
              q: '기준금리가 오르면 예금·대출 금리도 꼭 오르나요?',
              a: '꼭 그렇지는 않아요. 기준금리 인상은 대체로 예금·대출 금리 상승으로 이어지지만, 반드시 같은 방향으로 움직이는 건 아니에요.',
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
      { label: '한국은행 대한민국 경제교실 3강: 금리에 대한 이해', url: 'https://www.bok.or.kr/portal/bbs/B0000217/view.do?nttId=233448&menuNo=200144' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/LSW//lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000821176&lsId=001565&print=print' },
    ],
  },
};

const interestIncomeTax: Published = {
  status: 'published',
  title: '이자소득세',
  hashtags: '📖 #이자소득 #원천징수 #세후이자',
  cover: { src: '/guide/interest-income-tax.png', alt: '한 조각이 떨어져 나간 동전' },
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
              q: '세금이 1천 원도 안 되면 걷지 않나요?',
              a: '원천징수할 소득세가 1천 원 미만이면 걷지 않는 규정이 있지만, 이자소득에는 이 규정이 적용되지 않아요. 그래서 소득세가 1천 원보다 적다는 이유로 면제되지는 않아요.',
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
  cover: { src: '/guide/simple-vs-compound.png', alt: '일정하게 오르는 직선과 갈수록 가파르게 오르는 곡선' },
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
              q: '1년만 맡겨도 복리가 단리보다 이자가 많나요?',
              a: '1년마다 이자를 더하는 복리라면 첫 1년 동안은 단리와 이자가 같아요. 아직 이자를 원금에 더하기 전이기 때문이에요. 매달 이자를 더하는 월복리는 1년 안에도 이자에 이자가 붙어요.',
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
  cover: { src: '/guide/inflation-real-rate.png', alt: '점점 작아지는 동전과 위로 향한 화살표' },
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
              q: '예금 금리보다 물가가 더 많이 오르면 어떻게 되나요?',
              a: '실질금리가 0보다 낮아져요. 이자를 받아도 원금과 이자를 합친 돈으로 살 수 있는 물건이 맡기기 전보다 줄어들 수 있어요.',
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
  cover: { src: '/guide/exchange-rate.png', alt: '원화와 달러 동전 사이를 오가는 화살표' },
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
              q: '은행에서 달러를 살 때와 팔 때 환율이 왜 달라요?',
              a: '은행은 외화를 거래할 때 기준이 되는 **매매기준율**에 수수료 등을 더하거나 빼서 고객에게 적용할 환율을 정해요. 그래서 내가 달러를 살 때 환율이 팔 때보다 높고, 이 환율은 은행마다 다를 수 있어요.',
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
  cover: { src: '/guide/gross-vs-net-pay.png', alt: '마지막 줄이 강조된 급여명세서와 동전' },
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
              q: '매달 떼는 소득세를 조절할 수 있나요?',
              a: '근로자가 신청하면 간이세액표 금액의 **80%** 또는 **120%**로 뗄 수 있어요. 다만 1년 치 세금은 연말정산 때 다시 계산하므로, 매달 덜 떼면 연말정산 때 더 낼 수 있어요.',
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
  cover: { src: '/guide/year-end-tax.png', alt: '마지막 칸이 강조된 달력과 돌아오는 동전' },
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
              q: '간소화 서비스에 나온 자료는 그대로 공제받으면 되나요?',
              a: '아니요. 학교, 병·의원, 카드회사 등이 낸 자료를 그대로 보여 주는 것이라 공제 대상이 아닌 자료가 섞여 있을 수 있어요. 공제 요건은 근로자가 직접 확인해야 해요. 간소화 서비스에 없거나 빠진 자료는 발급기관에서 직접 받아 회사에 내면 공제받을 수 있어요.',
              mark: 'no',
            },
            {
              q: '더 낼 세금이 많으면 한 번에 내야 하나요?',
              a: '추가로 낼 세금이 10만 원을 넘으면, 회사가 2월분부터 4월분 월급까지 나누어 뗄 수 있어요.',
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
  cover: { src: '/guide/credit-score.png', alt: '높은 구간을 가리키는 반원형 점수 계기판' },
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
              q: '신용점수를 조회하면 점수가 떨어지나요?',
              a: '아니요. 신용평점을 조회하더라도 신용평점에는 영향을 주지 않아요.',
              mark: 'no',
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
  cover: { src: '/guide/loan-rate-repayment.png', alt: '점점 낮아지는 막대와 동전' },
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

const savingVsInvesting: Published = {
  status: 'published',
  title: '저축 vs 투자',
  hashtags: '📖 #저축 #투자 #비상금',
  cover: { src: '/guide/saving-vs-investing.png', alt: '동전이 담긴 유리병과 상승하는 막대그래프' },
  sections: [
    {
      title: '✏️ 저축과 투자는 뭐가 달라요?',
      blocks: [
        { type: 'p', text: '저축은 소득 중에서 생활에 필요한 만큼 쓰고 **미래의 지출에 대비해 남겨 둔 돈**이에요. 투자는 저축한 돈을 미래에 가치를 늘리려고 여러 형태의 자산으로 바꾸는 거예요. 금융에서는 주로 주식·채권처럼 **가치가 오르내릴 수 있는 자산**에 돈을 넣는 것을 말해요.' },
        {
          type: 'terms',
          items: [
            { term: '예·적금', desc: '약속한 이자율로 이자를 받아요. 은행·저축은행 예·적금은 원금과 이자를 합쳐 금융회사별 1인당 1억 원까지 예금자보호를 받아요(2026년 11월 확인).' },
            { term: '주식·채권 등 투자', desc: '저축 이자보다 큰 수익이 날 수도 있지만, 수익이 매우 적거나 **원금 손실**을 볼 수도 있어요. 펀드 같은 실적배당형 상품은 예금자보호 대상이 아니에요.' },
          ],
        },
      ],
    },
    {
      title: '⚖️ 금융상품을 고를 때 볼 세 가지',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '안전성', desc: '원금과 이자가 지켜질 수 있는 정도예요.' },
            { term: '수익성', desc: '가격 상승이나 이자 수익을 기대할 수 있는 정도예요.' },
            { term: '환금성', desc: '돈이 필요할 때 큰 손해 없이 바로 현금으로 바꿀 수 있는 정도예요.' },
          ],
        },
        { type: 'p', text: '수익이 높은 상품은 위험이 높거나 환금성이 떨어지는 등 분명한 이유가 있어요. 그래서 한 상품에 몰기보다 여러 상품에 나눠 위험을 줄이는 방법이 있어요.' },
      ],
    },
    {
      title: '🧯 투자 전에 비상금부터',
      blocks: [
        { type: 'p', text: '실업, 질병, 사고처럼 갑작스러운 일에 대비하는 것도 저축 목적 중 하나예요. 한국은행 경제교육 자료는 쓰고 남은 돈을 **비상금 통장**에 모으고, 비상금이 충분히 쌓이면 그다음에 투자로 넘어가 장기투자를 하는 순서를 소개해요.' },
        { type: 'p', text: '환금성이 높은 상품의 예로 은행의 **수시입출금식 예금**이 있어요. 쉽게 현금으로 인출할 수 있는 대신, 환금성이 높으면 일반적으로 수익성은 낮아요. 비상금을 둘 만한 통장은 ‘파킹통장 vs CMA’ 글에서 더 볼 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: '투자 상품도 예금자보호를 받나요?',
              a: '아니요. 펀드 등 금융투자상품, 실적배당형 상품, 증권사 CMA처럼 운용실적에 따라 받는 돈이 달라지는 상품은 예금자보호 대상이 아니에요.',
              mark: 'no',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*투자 상품은 원금 손실이 생길 수 있어요. 이 글은 특정 상품을 추천하지 않아요.',
      '*예금자보호 한도는 2026년 11월 4일에 확인한 예금보험공사 자료 기준이에요.',
      '*이 콘텐츠는 한국은행, 금융감독원, 예금보험공사의 자료를 참고했어요.',
    ],
    sources: [
      { label: '한국은행 경제교육: 23. 장기 생활설계', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=165640&searchOptn8=16&menuNo=200134&listType=G&pageIndex=1' },
      { label: '한국은행 경제교육: 24. 재산늘리기', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?menuNo=200647&nttId=165641&pageIndex=&type=YNGBGS' },
      { label: '한국은행 알기 쉬운 경제이야기: 쉽게 알아보는 자산관리 비법', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?nttId=10082471&menuNo=200647' },
      { label: '금융감독원 e-금융교육센터: 저축', url: 'https://www.fss.or.kr/edu/fec/contMng/view.do?contentsSlno=618&menuNo=300017' },
      { label: '예금보험공사: 예금자보호제도 FAQ', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystFaq/selectScrn.do' },
      { label: '예금보험공사: 보호한도', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtLmts/selectScrn.do' },
    ],
  },
};

const depositVsSavings: Published = {
  status: 'published',
  title: '예금 vs 적금',
  hashtags: '📖 #예금 #적금 #예금자보호',
  cover: { src: '/guide/deposit-vs-savings.png', alt: '한 번에 쌓은 동전 더미와 조금씩 높아지는 동전 더미' },
  sections: [
    {
      title: '✏️ 예금과 적금은 뭐가 달라요?',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '예금', desc: '일정한 금액을 기간을 정해 맡기는 상품이에요. **목돈 굴리기**에 맞아요.' },
            { term: '적금', desc: '매달 정한 금액을 넣거나(정액적립식) 금액을 정하지 않고 자유롭게 넣는(자유적립식) 상품이에요. **목돈 만들기**에 맞아요.' },
          ],
        },
        { type: 'p', text: '금융감독원은 정기적금은 고정소득이 있는 급여생활자에게, 자유적금은 자영업자처럼 소득이 일정하지 않은 사람에게 맞다고 안내해요.' },
      ],
    },
    {
      title: '🔢 적금 이자는 이렇게 계산돼요',
      blocks: [
        { type: 'p', text: '적금은 매달 넣은 돈마다 맡긴 기간이 달라요. 단리 적금이라면 첫 달에 넣은 돈에는 12개월 치, 마지막 달에 넣은 돈에는 1개월 치 이자가 붙어요.' },
        {
          type: 'calc',
          terms: [
            { label: '세전 이자', value: '32,500원' },
            { label: '세금 15.4%', value: '5,005원' },
            { label: '받는 이자', value: '27,495원' },
          ],
          ops: ['−', '='],
          caption: '예시 · 매달 10만 원씩 12개월, 연 5% 단리 적금',
        },
        { type: 'p', text: '같은 연 5%라도 120만 원을 처음에 한 번에 1년 동안 예금하면 세전 이자는 6만 원이에요(예시). 적금은 나중에 넣은 돈일수록 이자가 붙는 기간이 짧기 때문이에요.' },
      ],
    },
    {
      title: '🧾 가입 전에 확인할 것',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '우대금리', desc: '금융상품한눈에의 기본금리는 우대조건을 뺀 금리예요. 조건을 채우면 더 높은 이자율이 적용될 수 있지만, 계약 기간 중 거래실적 조건을 채우지 못하면 우대혜택을 받지 못할 수 있어요.' },
            { term: '중도해지', desc: '예·적금을 만기 전에 해지하면 약정한 이율보다 **낮은 중도해지 금리**가 적용돼요. 중도해지 금리는 가입 기간에 따라 달라요.' },
            { term: '예금자보호', desc: '은행·저축은행 예·적금은 한 금융회사의 모든 예·적금 원금과 이자를 합쳐 1인당 **1억 원**까지 보호돼요(2026년 11월 확인). 서로 다른 금융회사의 예·적금은 회사마다 따로 1억 원까지 보호돼요.' },
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
              q: '모아 둔 목돈이 없다면 예금과 적금 중 무엇이 나아요?',
              a: '금융감독원은 예금을 중도에 해지하면 약정 이율보다 낮은 이자를 받으므로, 여유자금이 없는 경우에는 예금보다 적금이 더 유리하다고 안내해요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*예시 금액과 금리는 이해를 돕기 위해 정한 숫자로, 현재 실제 금리가 아니에요. 실제 이자는 상품의 계산 방식과 끝수 처리에 따라 조금 다를 수 있어요.',
      '*예금자보호 한도는 2026년 11월 4일에 확인한 예금보험공사 자료 기준이에요. 상품별 조건은 금융회사의 상품설명서를 확인하세요.',
      '*이 콘텐츠는 금융감독원과 예금보험공사의 자료를 참고했어요.',
    ],
    sources: [
      { label: '금융상품한눈에: 적금', url: 'https://finlife.fss.or.kr/finlife/svings/fdrmEnty/list.do?menuNo=700003' },
      { label: '금융상품한눈에: 정기예금', url: 'https://finlife.fss.or.kr/finlife/svings/fdrmDpst/list.do?menuNo=700002' },
      { label: '금융감독원 파인: 예·적금 기본사항 챙기세요', url: 'https://fine.fss.or.kr/main/prc/dp/sub/dp016.jsp?menuNo=900265' },
      { label: '금융감독원 파인: 중도 해약 전 알아두세요', url: 'https://fine.fss.or.kr/main/prc/dp/sub/dp019.jsp?menuNo=900230' },
      { label: '예금보험공사: 예금자보호제도 FAQ', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystFaq/selectScrn.do' },
      { label: '예금보험공사: 보호한도', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtLmts/selectScrn.do' },
    ],
  },
};

const parkingVsCma: Published = {
  status: 'published',
  title: '파킹통장 vs CMA',
  hashtags: '📖 #파킹통장 #CMA #비상금',
  cover: { src: '/guide/parking-vs-cma.png', alt: '주차 표지판과 동전' },
  sections: [
    {
      title: '✏️ 파킹통장이 뭐예요?',
      blocks: [
        { type: 'p', text: '‘파킹통장’은 정식 상품 이름이 아니라, 금리를 쏠쏠하게 주는 **수시입출식 통장**을 부르는 말이에요. 차를 잠깐 세워 두듯 돈을 넣어 두고 언제든 뺄 수 있어요.' },
        { type: 'p', text: '다만 입출금 통장을 새로 만들 때 금융거래 목적을 증명하는 서류를 내지 못하면, 하루 인출 금액이 제한되는 **한도제한계좌**로 열릴 수 있어요. 은행은 비대면 채널 각 30만 원, 창구 100만 원까지 인출할 수 있어요(2026년 11월 확인). 저축은행은 한도제한계좌가 따로 없고 계좌를 만들 때 금융거래 목적 확인서를 내요.' },
        {
          type: 'terms',
          items: [
            { term: '요구불예금', desc: '보통예금처럼 언제든 조건 없이 넣고 뺄 수 있는 대신 이자가 거의 없거나 매우 낮아요.' },
            { term: 'MMDA', desc: '은행의 시장금리부 수시입출금식 예금이에요. 수시로 넣고 빼며 이체·결제도 할 수 있고, 예금 금액에 따라 금리가 다르게 적용돼요.' },
          ],
        },
        { type: 'p', text: '은행의 요구불예금과 MMDA는 **예금자보호 대상**이에요. 한 금융회사에 맡긴 예금 등의 원금과 이자를 합쳐 1인당 1억 원까지 보호돼요(2026년 11월 확인).' },
      ],
    },
    {
      title: '🏦 CMA는 뭐예요?',
      blocks: [
        { type: 'p', text: '증권사 CMA는 **예금이 아니에요.** CMA에 넣은 돈은 RP나 MMF 등에 자동으로 투자돼요.' },
        {
          type: 'terms',
          items: [
            { term: 'RP형 CMA', desc: '넣은 돈이 RP에 투자돼요. 수익률은 시장금리 상황 등에 따라 바뀔 수 있고, 예금자보호가 되지 않아요.' },
            { term: 'MMF형 CMA', desc: '넣은 돈이 MMF에 투자돼요. 운용 결과에 따라 **투자원금 손실**이 생길 수 있고, 예금자보호가 되지 않아요.' },
          ],
        },
        { type: 'p', text: '종합금융회사의 어음관리계좌(CMA)는 증권사 CMA와 달리 예금보험공사의 보호 대상 상품이에요. 이름이 같아도 어느 금융회사 상품인지 확인해야 해요.' },
      ],
    },
    {
      title: '⚖️ 비상금은 어디에 둘까?',
      blocks: [
        { type: 'p', text: '파킹통장과 CMA는 둘 다 수시로 넣고 빼는 돈을 두는 데 쓰여요. 차이는 **예금자보호**와 **손실 가능성**이에요. 은행 수시입출식 예금은 예금자보호를 받고, 증권사 CMA는 예금자보호를 받지 못하며 MMF형은 원금 손실이 생길 수도 있어요.' },
        { type: 'p', text: '비상금을 먼저 모아 두는 이유는 ‘저축 vs 투자’ 글에서 볼 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'CMA는 예금자보호를 전혀 못 받나요?',
              a: '증권사 CMA는 예금자보호 대상이 아니에요. 다만 종합금융회사의 어음관리계좌(CMA)는 보호 대상 상품이에요. 가입 전에 상품설명서에서 어떤 상품에 투자되는지와 예금자보호 여부를 확인하세요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*증권사 CMA는 예금자보호를 받지 못하고, MMF형 CMA는 원금 손실이 생길 수 있어요. 이 글은 특정 상품이나 금융회사를 추천하지 않아요.',
      '*예금자보호 기준은 2026년 11월 4일에 확인한 예금보험공사 자료 기준이에요. 상품별 금리와 조건은 금융회사의 상품설명서를 확인하세요.',
      '*이 콘텐츠는 금융위원회, 금융감독원, 예금보험공사, 금융투자협회의 자료를 참고했어요.',
    ],
    sources: [
      { label: '금융위원회: 온라인 예금 중개 제도화, ‘파킹통장’도 비교(2025. 4. 17.)', url: 'https://www.fsc.go.kr/no010107/84386' },
      { label: '금융감독원 파인: 예·적금 상품 어떤게 있나요?', url: 'https://fine.fss.or.kr/main/prc/dp/sub/dp001.jsp?menuNo=900233' },
      { label: '금융감독원 파인: 상품별 개별사항', url: 'https://fine.fss.or.kr/main/prc/dp/sub/dp015.jsp?menuNo=900230' },
      { label: '예금보험공사: 보호대상 금융상품 개요', url: 'https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do' },
      { label: '예금보험공사: 보호한도', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtLmts/selectScrn.do' },
      { label: '금융투자협회: CMA 업무관련 모범규준', url: 'https://law.kofia.or.kr/service/law/lawFullScreenContent.do?seq=285&historySeq=784' },
    ],
  },
};

const isaVsPension: Draft = {
  status: 'draft',
  title: 'ISA vs 연금저축',
  hashtags: '📖 #ISA #연금저축 #세액공제',
  cover: { src: '/guide/isa-vs-pension.png', alt: '동전이 그려진 방패와 확인 표시' },
  sections: [
    {
      title: '✏️ ISA는 뭐예요?',
      blocks: [
        { type: 'p', text: 'ISA(개인종합자산관리계좌)는 한 계좌에 예·적금, 펀드, ELS 같은 여러 금융상품을 담아 운용하는 **절세 계좌**예요. 1명당 1개만 만들 수 있어요.' },
        {
          type: 'terms',
          items: [
            { term: '가입 대상', desc: '19세 이상 거주자(직전 해 근로소득이 있으면 15세 이상)예요. 직전 3개 과세기간 중 한 번이라도 금융소득종합과세 대상이었다면 가입할 수 없어요.' },
            { term: '납입 한도', desc: '1년에 **2천만 원**까지 넣을 수 있고, 못 채운 한도는 다음 해로 넘어가요. 모두 합쳐 **1억 원**까지예요.' },
            { term: '세금 혜택', desc: '계좌 안 상품의 이익과 손실을 합친 순이익 중 **200만 원**(총급여 5천만 원 이하 등 서민형은 400만 원)까지 세금이 없고, 넘는 금액은 9%로 분리과세돼요.' },
            { term: '유지 기간', desc: '가입하고 **3년** 안에 해지하면 그동안 받은 세금 혜택만큼 세금을 다시 내야 해요(사망·해외이주 같은 부득이한 사유는 제외).' },
          ],
        },
      ],
    },
    {
      title: '🧓 연금저축은 뭐예요?',
      blocks: [
        { type: 'p', text: '연금저축은 ‘연금저축’이라는 이름으로 신탁, 펀드, 보험 계약을 맺어 만드는 **노후 대비 연금계좌**예요.' },
        {
          type: 'terms',
          items: [
            { term: '세액공제', desc: '1년에 낸 돈 중 **600만 원**까지(퇴직연금과 합쳐 900만 원) 낸 돈의 12%를 세금에서 빼 줘요. 종합소득금액 4,500만 원 이하(근로소득만 있으면 총급여 5,500만 원 이하)라면 15%예요.' },
            { term: '연금으로 받을 때', desc: '55세 이후, 가입 5년이 지나 정해진 한도 안에서 찾으면 연금소득세를 내요. 이 연금이 1년에 1,500만 원 이하라면 세율은 나이에 따라 **5%~3%**(지방소득세 포함 5.5%~3.3%)예요.' },
            { term: '중간에 찾을 때', desc: '세액공제를 받은 돈과 운용 수익을 연금 말고 다른 방식으로 찾으면 기타소득으로 보고 소득세 15%를 떼요. 지방소득세를 더하면 16.5%예요.' },
          ],
        },
        {
          type: 'calc',
          terms: [
            { label: '연금저축 납입', value: '600만 원' },
            { label: '공제율', value: '15%' },
            { label: '세액공제', value: '90만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 총급여 5,500만 원 이하, 지방소득세 제외',
        },
      ],
    },
    {
      title: '⚖️ 두 계좌, 이렇게 달라요',
      blocks: [
        { type: 'p', text: 'ISA는 **3년**을 유지하면 세금 혜택을 받고, 연금저축은 **55세 이후 연금으로** 받아야 세금 혜택이 유지돼요. 두 계좌 모두 펀드처럼 운용실적에 따라 달라지는 상품에 넣으면 **원금 손실**이 생길 수 있어요.' },
        { type: 'p', text: 'ISA 계약기간이 끝난 뒤 잔액을 정해진 방법으로 연금계좌에 옮기면, 옮긴 금액의 10%(최대 300만 원)를 그해 연금계좌 세액공제 한도에 더해 받을 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: 'ISA나 연금저축도 예금자보호를 받나요?',
              a: 'ISA는 예금 같은 보호상품으로 운용되는 부분만 보호돼요. 연금저축신탁과 연금저축보험은 일반 예금과 별도로 1억 원까지 보호되지만, 연금저축펀드는 펀드라서 보호되지 않아요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*ISA와 연금저축에 담은 펀드·ELS 등은 원금 손실이 생길 수 있어요. 이 글은 특정 상품이나 금융회사를 추천하지 않아요.',
      '*한도, 공제율, 세율은 2026년 11월 4일에 확인한 조세특례제한법(2026. 9. 18. 시행)·소득세법(2026. 1. 1. 시행)과 금융감독원·예금보험공사 자료 기준이에요. 법이 바뀌면 달라질 수 있어요.',
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요.',
    ],
    sources: [
      { label: '금융상품한눈에: ISA', url: 'https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700061' },
      { label: '조세특례제한법 제91조의18(개인종합자산관리계좌)', url: 'https://www.law.go.kr/법령/조세특례제한법/제91조의18' },
      { label: '소득세법 제59조의3(연금계좌세액공제)', url: 'https://www.law.go.kr/법령/소득세법/제59조의3' },
      { label: '소득세법 시행령 제40조의2(연금계좌 등)', url: 'https://www.law.go.kr/법령/소득세법시행령/제40조의2' },
      { label: '소득세법 제21조(기타소득)', url: 'https://www.law.go.kr/법령/소득세법/제21조' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/법령/소득세법/제129조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
      { label: '예금보험공사: 예금자보호제도 FAQ', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystFaq/selectScrn.do' },
    ],
  },
};

const housingSubscription: Draft = {
  status: 'draft',
  title: '청약통장',
  hashtags: '📖 #청약통장 #주택청약종합저축 #소득공제',
  cover: { src: '/guide/housing-subscription.png', alt: '집과 동전' },
  sections: [
    {
      title: '✏️ 청약통장이 뭐예요?',
      blocks: [
        { type: 'p', text: '흔히 청약통장이라고 부르는 **주택청약종합저축**은 국민주택과 민영주택을 공급받으려고 가입하는 입주자저축이에요.' },
        {
          type: 'terms',
          items: [
            { term: '가입 대상', desc: '누구든지 가입할 수 있어요. 다만 한 사람이 **한 계좌만** 가입할 수 있어요.' },
            { term: '가입하는 곳', desc: '국토교통부장관이 지정한 은행에서 가입해요.' },
            { term: '월납입금', desc: '매달 약정한 날에 **2만 원 이상 50만 원 이하**를 넣어요. 정해진 범위 안에서 미리 넣는 것(선납)도 돼요.' },
            { term: '인정 금액', desc: '**국민주택** 청약 순위를 정할 때 저축총액은 한 달에 25만 원을 넘게 넣었어도 **25만 원**으로 계산해요(2026년 11월 확인). 민영주택은 지역·면적별 예치기준금액만큼 넣었는지를 봐요.' },
          ],
        },
      ],
    },
    {
      title: '💰 소득공제를 받을 수 있어요',
      blocks: [
        { type: 'p', text: '총급여 7천만 원 이하 근로자로서 무주택 세대의 세대주(또는 그 배우자)라면, 2028년 12월 31일까지 한 해에 넣은 돈(연 300만 원 한도)의 **40%**를 근로소득금액에서 공제받을 수 있어요(2026년 11월 확인).' },
        {
          type: 'calc',
          terms: [
            { label: '1년 납입액', value: '300만 원' },
            { label: '공제율', value: '40%' },
            { label: '소득공제액', value: '120만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 소득에서 빼 주는 금액이에요. 줄어드는 세금은 이보다 적어요',
        },
        { type: 'p', text: '공제를 받으려면 다음 해 2월 말까지 가입한 은행에 무주택 확인서를 내야 해요. 주택 당첨 같은 정해진 사유가 아닌데 중도해지하면, 그해 넣은 돈은 공제받지 못해요.' },
      ],
    },
    {
      title: '🛡️ 예금자보호는요?',
      blocks: [
        { type: 'p', text: '주택청약종합저축은 예금보험공사의 예금자보호 대상이 아니에요. 대신 **주택도시기금**으로 정부가 별도로 관리해요.' },
        { type: 'p', text: '금리는 바뀔 수 있으니 가입한 은행이나 국토교통부 안내에서 확인하세요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: '매달 50만 원을 넣으면 청약에 더 유리한가요?',
              a: '국민주택 청약에서 저축총액을 셀 때는 한 달에 최대 25만 원까지만 인정돼요. 소득공제도 1년에 300만 원(한 달 25만 원꼴)까지만 납입액으로 쳐요. 민영주택은 예치기준금액을 채웠는지가 기준이에요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*한도와 공제율은 2026년 11월 4일에 확인한 주택공급에 관한 규칙(2026. 6. 15. 시행)·조세특례제한법(2026. 9. 18. 시행)과 예금보험공사 자료 기준이에요. 법이 바뀌면 달라질 수 있어요.',
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요. 청약 자격과 순위는 주택 유형과 공고마다 다르니 청약 공고를 확인하세요.',
      '*이 콘텐츠는 국가법령정보센터와 예금보험공사의 자료를 참고했어요.',
    ],
    sources: [
      { label: '주택법 제56조(입주자저축)', url: 'https://www.law.go.kr/법령/주택법/제56조' },
      { label: '주택공급에 관한 규칙 제9조(가입 및 납입조건)', url: 'https://www.law.go.kr/법령/주택공급에관한규칙/제9조' },
      { label: '주택공급에 관한 규칙 제10조(월납입금 선납·연체 등)', url: 'https://www.law.go.kr/법령/주택공급에관한규칙/제10조' },
      { label: '주택공급에 관한 규칙 제27조(국민주택의 일반공급)', url: 'https://www.law.go.kr/법령/주택공급에관한규칙/제27조' },
      { label: '주택공급에 관한 규칙 제28조(민영주택의 일반공급)', url: 'https://www.law.go.kr/법령/주택공급에관한규칙/제28조' },
      { label: '조세특례제한법 제87조(주택청약종합저축 소득공제)', url: 'https://www.law.go.kr/법령/조세특례제한법/제87조' },
      { label: '예금보험공사: 보호대상 금융상품 개요', url: 'https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do' },
    ],
  },
};

const stockBasics: Published = {
  status: 'published',
  title: '주식 기초',
  hashtags: '📖 #주식 #배당 #상장',
  cover: { src: '/guide/stock-basics.png', alt: '상승 흐름의 캔들 차트' },
  sections: [
    {
      title: '✏️ 주식이 뭐예요?',
      blocks: [
        { type: 'p', text: '주식은 주식회사가 자본금을 받고 그 대가로 발행하는 증권이에요. 주식을 가진 **주주**는 가진 주식 수만큼 그 회사의 지분을 가져요. 흔히 말하는 주식인 보통주를 가진 주주는 의결권이 있어 주주총회에서 회사의 의사결정에 참여할 수 있어요.' },
        {
          type: 'terms',
          items: [
            { term: '자본이득', desc: '산 가격보다 비싸게 팔아서 생기는 차익이에요. 산 가격보다 싸게 팔면 손실이 나요.' },
            { term: '배당금', desc: '회사에 이익이 남으면 주주에게 나누어 주는 돈이에요. 회사에 돈이 남지 않으면 받지 못할 수도 있어요.' },
            { term: '주가', desc: '주식시장에서 사려는 사람과 팔려는 사람의 수요와 공급으로 정해져요. 회사의 앞으로의 수익성과 경기·금리·환율·물가 등이 영향을 줘요.' },
          ],
        },
      ],
    },
    {
      title: '🏦 어떻게 사고팔아요?',
      blocks: [
        { type: 'p', text: '개인은 한국거래소에서 직접 거래할 수 없어서, **증권회사에 계좌**를 만들고 그 증권회사를 통해 주문해요. 거래소에서 사고팔 수 있는 주식은 **상장**된 주식이에요. 상장은 거래를 허용한다는 뜻일 뿐, 주식의 가치를 보증하는 것은 아니에요.' },
        {
          type: 'terms',
          items: [
            { term: '정규시장', desc: '평일 오전 9시부터 오후 3시 30분까지예요(2026년 11월 확인). 이 시간 앞뒤에는 시간외 거래가 따로 있어요.' },
            { term: '결제일', desc: '거래가 체결된 날부터 세어 **3일째 되는 날(T+2)**에 산 주식의 대금을 내고 판 주식을 넘겨요. 휴장일은 빼고 세요.' },
            { term: '가격제한폭', desc: '주가는 하루 동안 기준가격(보통 전날 종가)보다 **30%**까지만 오르거나 내릴 수 있어요. 정리매매 종목 등 일부는 예외예요.' },
          ],
        },
      ],
    },
    {
      title: '⚠️ 꼭 알아 둘 점',
      blocks: [
        { type: 'p', text: '주식은 **원금이 보장되지 않아요.** 경기가 나빠지거나 회사 경영이 부실해지면 주가가 떨어져 원금 손실이 날 수 있고, 상장폐지되거나 회사가 도산하면 팔기 어려워질 수도 있어요. 금융감독원은 주식이 채권보다 투자 위험이 비교적 높다고 설명해요.' },
        { type: 'p', text: '배당금을 받으면 소득세 14%와 지방소득세 1.4%를 합친 **15.4%**를 떼고 받아요(2026년 11월 확인). 이자와 배당을 합친 금융소득이 1년에 2천만 원을 넘으면 종합과세 대상이 돼요. 주식을 팔 때는 증권거래세 등 세금이 붙어요.' },
        {
          type: 'calc',
          terms: [
            { label: '배당금', value: '10만 원' },
            { label: '세금 15.4%', value: '15,400원' },
            { label: '받는 돈', value: '84,600원' },
          ],
          ops: ['−', '='],
          caption: '예시 · 소득세 14%와 지방소득세 1.4%를 뗀 금액',
        },
      ],
    },
    {
      title: '🧭 자주 보는 주식 용어',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '시가총액', desc: '현재 주가에 주식 수를 곱한 값이에요. 그 주식이 시장에서 갖는 가치의 총액이에요.' },
            { term: '우선주', desc: '이익 배당이나 회사가 청산할 때 남은 재산을 보통주보다 먼저 받는 주식이에요.' },
            { term: '상한가·하한가', desc: '하루에 오를 수 있는 최고 가격(기준가격 + 가격제한폭)과 내릴 수 있는 최저 가격(기준가격 − 가격제한폭)이에요.' },
            { term: '지정가 주문', desc: '사거나 팔 가격을 정해서 내는 주문이에요. 많은 투자자가 이 방법을 써요.' },
            { term: '시장가 주문', desc: '가격을 정하지 않고, 주문하는 때에 가장 유리한 가격으로 먼저 거래되도록 내는 주문이에요.' },
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
              q: '증권 계좌에 넣어 둔 돈도 예금자보호를 받나요?',
              a: '주식을 사는 데 쓰지 않고 계좌에 **현금으로 남아 있는 돈**은 예금자보호 대상이에요. 원금과 이자를 합쳐 금융회사별로 1인당 1억 원까지 보호돼요(2026년 11월 확인). 하지만 그 돈으로 산 주식이나 펀드 같은 금융투자상품은 보호되지 않아요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*주식은 원금 손실이 생길 수 있어요. 이 글은 특정 종목이나 금융회사를 추천하지 않아요.',
      '*거래 시간, 가격제한폭, 세율, 예금자보호 한도는 2026년 11월 4일에 확인한 한국거래소·예금보험공사 자료와 소득세법(2026. 1. 1. 시행) 기준이에요. 바뀔 수 있어요.',
      '*예시 금액은 이해를 돕기 위해 정한 숫자예요.',
    ],
    sources: [
      { label: '금융감독원 e-금융교육센터: 성인을 위한 실용금융 (4)', url: 'https://www.fss.or.kr/edu/fec/contMng/view.do?contentsSlno=619&menuNo=300017' },
      { label: '한국은행 경제이야기: 21. 금융', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=PEPL&nttId=165638&menuNo=200648' },
      { label: '한국거래소: 유가증권시장 매매거래제도일반', url: 'https://regulation.krx.co.kr/contents/RGL/03/03010100/RGL03010100.jsp' },
      { label: '한국거래소: 상장의 정의', url: 'https://listing.krx.co.kr/contents/LST/02/02010000/LST02010000.jsp' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/법령/소득세법/제129조' },
      { label: '소득세법 제14조(과세표준의 계산)', url: 'https://www.law.go.kr/법령/소득세법/제14조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
      { label: '예금보험공사: 보호대상 금융상품 개요', url: 'https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do' },
      { label: '예금보험공사: 보호한도', url: 'https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtLmts/selectScrn.do' },
    ],
  },
};

const kospiVsKosdaq: Published = {
  status: 'published',
  title: '코스피 vs 코스닥',
  hashtags: '📖 #코스피 #코스닥 #주가지수',
  cover: { src: '/guide/kospi-vs-kosdaq.png', alt: '서로 다른 흐름의 그래프 패널 두 개' },
  sections: [
    {
      title: '✏️ 코스피와 코스닥은 뭐예요?',
      blocks: [
        { type: 'p', text: '코스피와 코스닥은 한국거래소가 운영하는 **주식시장**의 이름이자, 각 시장의 주가 흐름을 보여 주는 **주가지수**의 이름이에요. 코스피는 원래 종합주가지수를 뜻하는 말인데, 지금은 유가증권시장을 코스피시장이라고도 불러요.' },
        {
          type: 'terms',
          items: [
            { term: '코스피시장', desc: '1956년에 문을 연 우리나라 대표 증권시장(유가증권시장)이에요. 대형 우량기업이 많이 상장돼 있어요.' },
            { term: '코스닥시장', desc: 'IT·바이오(BT)·문화기술(CT) 기업과 벤처기업의 자금 조달을 위해 1996년 7월에 개설된 시장이에요. 코스피시장보다 상장 요건이 상대적으로 완화돼 있어요.' },
            { term: '코넥스시장', desc: '초기 중소·벤처기업을 위해 따로 만든 시장이에요.' },
          ],
        },
      ],
    },
    {
      title: '📈 주가지수는 어떻게 계산해요?',
      blocks: [
        { type: 'p', text: '두 지수 모두 **시가총액식**이에요. 시가총액은 주가에 주식 수를 곱한 값으로, 기준 시점의 시가총액과 비교해 지금 시가총액이 얼마나 되는지를 숫자로 나타내요.' },
        {
          type: 'terms',
          items: [
            { term: '코스피지수', desc: '유가증권시장에 상장된 보통주로 계산하고, 1980년 1월 4일의 시가총액을 **100**으로 해요.' },
            { term: '코스닥지수', desc: '코스닥시장에 상장된 보통주로 계산하고, 1996년 7월 1일의 시가총액을 **1,000**으로 해요.' },
          ],
        },
        {
          type: 'calc',
          terms: [
            { label: '시가총액', value: '10배' },
            { label: '기준지수', value: '100' },
            { label: '코스피지수', value: '1,000' },
          ],
          ops: ['×', '='],
          caption: '예시 · 1980년 1월 4일보다 시가총액이 10배가 됐을 때',
        },
        { type: 'p', text: '두 지수는 기준 시점과 기준값이 달라서, 지수 숫자의 크기를 그대로 비교하면 안 돼요.' },
      ],
    },
    {
      title: '⚖️ 같은 점과 주의할 점',
      blocks: [
        { type: 'p', text: '두 시장 모두 주가는 하루에 기준가격(보통 전날 종가) 대비 **상하 30%**까지 움직일 수 있어요(일부 종목은 예외). 어느 시장이든 상장은 거래를 허용한다는 뜻일 뿐 주식의 가치를 보증하지 않고, 주식은 **원금 손실**이 생길 수 있어요.' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: '코스피가 오르면 내 주식도 오르나요?',
              a: '꼭 그렇지는 않아요. 지수는 시장 전체의 시가총액 흐름이라 시가총액이 큰 일부 대형주의 등락이 지수에 크게 영향을 줘요. 그래서 지수가 시장의 전반적인 흐름이나 내가 가진 종목의 움직임과 다를 수 있어요.',
            },
            {
              q: '코스피 200, 코스닥 150은 뭐예요?',
              a: '한국거래소가 산출하는 대표 지수예요. 특히 코스피 200은 선물·옵션, 상장지수상품(ETP), ELS, 인덱스펀드 같은 여러 금융상품의 기초지수로 쓰여요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*주식은 원금 손실이 생길 수 있어요. 이 글은 특정 종목, 시장이나 금융회사를 추천하지 않아요.',
      '*지수 기준과 가격제한폭은 2026년 11월 4일에 확인한 한국거래소·e-나라지표(금융위원회) 자료 기준이에요.',
      '*예시 숫자는 이해를 돕기 위해 정한 숫자예요.',
    ],
    sources: [
      { label: '한국거래소: 유가증권시장 소개', url: 'https://open.krx.co.kr/contents/OPN/01/01010101/OPN01010101.jsp' },
      { label: '한국거래소: 코스닥시장이란?', url: 'https://open.krx.co.kr/contents/OPN/01/01010201/OPN01010201.jsp' },
      { label: '한국거래소: 코스닥시장 특징', url: 'https://open.krx.co.kr/contents/OPN/01/01010202/OPN01010202.jsp' },
      { label: '한국거래소: 코넥스시장 소개', url: 'https://open.krx.co.kr/contents/OPN/01/01010301/OPN01010301.jsp' },
      { label: 'e-나라지표: 주가지수 및 코스닥종합지수', url: 'https://www.index.go.kr/unify/idx-info.do?idxCd=1080' },
      { label: '한국거래소: KRX지수사업', url: 'https://open.krx.co.kr/contents/OPN/02/02010100/OPN02010100.jsp' },
      { label: '한국거래소: 유가증권시장 매매거래제도일반', url: 'https://regulation.krx.co.kr/contents/RGL/03/03010100/RGL03010100.jsp' },
      { label: '한국거래소: 코스닥시장 기준가격/가격제한폭/상하한가', url: 'https://regulation.krx.co.kr/contents/RGL/03/03020201/RGL03020201.jsp' },
      { label: '한국거래소: 상장의 정의', url: 'https://listing.krx.co.kr/contents/LST/02/02010000/LST02010000.jsp' },
    ],
  },
};

const bondBasics: Published = {
  status: 'published',
  title: '채권 기초',
  hashtags: '📖 #채권 #국채 #회사채',
  cover: { src: '/guide/bond-basics.png', alt: '동전 인장이 달린 증서' },
  sections: [
    {
      title: '✏️ 채권이 뭐예요?',
      blocks: [
        { type: 'p', text: '채권은 정부, 공공기관, 금융회사, 주식회사 등이 돈을 빌리기 위해 발행하는 일종의 **차용증서**예요. 발행한 곳은 이익이 났는지와 상관없이 정해진 만기까지 약속한 이자와 원금을 갚아야 해요.' },
        {
          type: 'terms',
          items: [
            { term: '만기', desc: '빌린 돈을 갚기로 한 날이에요.' },
            { term: '표면이자', desc: '만기까지 정기적으로 주기로 한 이자예요.' },
            { term: '액면금액', desc: '만기일에 돌려주기로 한 금액이에요.' },
          ],
        },
        {
          type: 'calc',
          terms: [
            { label: '액면금액', value: '100만 원' },
            { label: '표면이자율', value: '연 10%' },
            { label: '1년 이자', value: '10만 원' },
          ],
          ops: ['×', '='],
          caption: '예시 · 만기 3년, 1년에 한 번 이자를 주는 채권, 세금 떼기 전',
        },
        { type: 'p', text: '이 채권은 3년 동안 매년 10만 원씩 이자를 주고, 3년 뒤에 원금 100만 원을 돌려줘요. 만기까지 들고 있어도 되고, 만기 전에 시장에서 팔아 현금으로 바꿀 수도 있어요.' },
        {
          type: 'terms',
          items: [
            { term: '국채', desc: '국가가 발행하는 채권이에요.' },
            { term: '지방채·특수채', desc: '지방자치단체, 또는 특별한 법률로 세운 기관이 발행하는 채권이에요.' },
            { term: '금융채·회사채', desc: '금융회사, 또는 일반 주식회사가 발행하는 채권이에요.' },
          ],
        },
      ],
    },
    {
      title: '⚠️ 채권도 손실이 날 수 있어요',
      blocks: [
        { type: 'p', text: '채권은 주식보다 투자 위험이 비교적 낮다고 설명되지만, 손실이 없는 상품은 아니에요.' },
        {
          type: 'terms',
          items: [
            { term: '금리 변동', desc: '시장금리가 오르면 이미 발행된 채권의 가격은 **떨어지고**, 금리가 내리면 **올라요.** 발행한 곳의 신용이 달라져도 가격이 바뀌어요. 만기 전에 팔 때는 산 가격보다 낮은 값에 팔 수도 있어요.' },
            { term: '채무불이행', desc: '발행한 곳의 경영이나 재무 상태가 나빠지면 이자나 원금을 늦게 받거나 받지 못할 수 있어요.' },
            { term: '유동성', desc: '발행량이 적거나 거래가 활발하지 않은 채권은 만기 전에 현금으로 바꾸기 어려울 수 있어요.' },
          ],
        },
        { type: 'p', text: '국채·공채는 일반 회사채보다 안전하다고 설명돼요. 은행이나 증권회사가 발행한 채권은 **예금자보호 대상이 아니에요.**' },
      ],
    },
    {
      title: '💬 자주 묻는 질문',
      blocks: [
        {
          type: 'faq',
          items: [
            {
              q: '개인도 채권을 살 수 있나요?',
              a: '한국거래소의 일반채권시장에서는 상장된 채권을 거래해요. 시장 참여자에 제한이 없고 액면 1만 원 단위로 거래할 수 있어 소액으로도 투자할 수 있어요. 채권형 펀드나 채권 ETF로 투자하는 방법도 있어요.',
            },
            {
              q: '채권 이자에도 세금이 붙나요?',
              a: '국가나 회사가 발행한 채권의 이자는 이자소득이에요. 소득세 14%와 지방소득세 1.4%를 합친 **15.4%**를 떼고 받아요(2026년 11월 확인). 이자와 배당을 합친 금융소득이 1년에 2천만 원을 넘으면 종합과세 대상이 돼요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*채권도 금리 변동이나 발행한 곳의 부도로 손실이 생길 수 있어요. 이 글은 특정 채권이나 금융회사를 추천하지 않아요.',
      '*세율과 거래 단위는 2026년 11월 4일에 확인한 소득세법(2026. 1. 1. 시행)·한국거래소·예금보험공사 자료 기준이에요. 바뀔 수 있어요.',
      '*예시 금액과 금리는 이해를 돕기 위해 정한 숫자예요.',
    ],
    sources: [
      { label: '금융감독원 e-금융교육센터: 성인을 위한 실용금융 (4)', url: 'https://www.fss.or.kr/edu/fec/contMng/view.do?contentsSlno=619&menuNo=300017' },
      { label: '한국은행 경제이야기: 21. 금융', url: 'https://www.bok.or.kr/portal/bbs/B0000216/view.do?type=PEPL&nttId=165638&menuNo=200648' },
      { label: '한국은행 한은금요강좌: 우리나라 채권시장의 이해와 최근 채권시장 동향(2024)', url: 'https://www.bok.or.kr/portal/bbs/B0000217/view.do?nttId=10088718&menuNo=200144' },
      { label: '한국은행 한은금요강좌: 채권시장의 이해(2015)', url: 'https://www.bok.or.kr/portal/bbs/B0000217/view.do?nttId=213828&menuNo=200144' },
      { label: '한국거래소: 채권시장', url: 'https://open.krx.co.kr/contents/OPN/01/01020000/OPN01020000.jsp' },
      { label: '예금보험공사: 보호대상 금융상품 개요', url: 'https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do' },
      { label: '소득세법 제16조(이자소득)', url: 'https://www.law.go.kr/법령/소득세법/제16조' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/법령/소득세법/제129조' },
      { label: '소득세법 제14조(과세표준의 계산)', url: 'https://www.law.go.kr/법령/소득세법/제14조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
    ],
  },
};

const fundVsEtf: Published = {
  status: 'published',
  title: '펀드 vs ETF',
  hashtags: '📖 #펀드 #ETF #분산투자',
  cover: { src: '/guide/fund-vs-etf.png', alt: '동전과 막대그래프가 함께 담긴 바구니' },
  sections: [
    {
      title: '✏️ 펀드는 뭐예요?',
      blocks: [
        { type: 'p', text: '펀드는 여러 투자자의 돈을 모아 자산운용회사가 주식, 채권, 부동산 등 여러 자산에 **나눠 투자**하고, 그 결과를 투자한 금액에 비례해 돌려주는 간접투자상품이에요. 운용 결과에 따라 수익이 날 수도, **원금 손실**이 날 수도 있고 그 결과는 투자자가 책임져요.' },
        {
          type: 'terms',
          items: [
            { term: '자산운용회사', desc: '펀드를 만들고, 펀드 재산을 어디에 얼마나 투자할지 정해요.' },
            { term: '판매회사', desc: '은행, 증권회사, 보험회사 등이 펀드를 권유하고 판매해요.' },
            { term: '수탁회사', desc: '투자자가 낸 돈은 자산운용회사가 아니라 수탁회사가 따로 관리해요.' },
            { term: '수수료와 보수', desc: '수수료는 가입하거나 찾을 때 한 번 내는 비용이고, 보수는 가입 기간 동안 펀드 순자산의 일정 비율로 계속 내는 비용이에요.' },
          ],
        },
      ],
    },
    {
      title: '📊 ETF는 뭐예요?',
      blocks: [
        { type: 'p', text: 'ETF(상장지수펀드)는 코스피 200 같은 특정 지수나 자산의 가격 움직임에 수익률이 연동되도록 만든 **펀드**예요. 거래소에 상장돼 **주식처럼** 사고팔아요.' },
        {
          type: 'terms',
          items: [
            { term: '거래 방법', desc: '주식과 거의 같은 방법으로 거래해요. 정규 매매시간은 평일 오전 9시~오후 3시 30분이고(2026년 11월 확인), 결제도 주식처럼 T+2예요.' },
            { term: '가격', desc: 'ETF 1주당 순자산가치(NAV)와 비슷하게 정해져요.' },
            { term: '분배금', desc: '담고 있는 자산에서 생긴 배당 등의 수익에서 보수와 경비를 뺀 뒤 나누어 줘요. 정해진 때마다 항상 주는 것은 아니에요.' },
          ],
        },
      ],
    },
    {
      title: '⚖️ 펀드와 ETF, 이렇게 달라요',
      blocks: [
        { type: 'p', text: '일반 펀드는 판매회사 등에서 가입하고, 돈을 찾을 때는 **환매**를 신청해요. 만기까지 원칙적으로 환매할 수 없는 폐쇄형 펀드도 있어요. 펀드에 따라 가입 후 3~6개월이 지나기 전에 환매하면 환매수수료가 붙을 수 있어요. ETF는 거래소에서 주식처럼 사고팔아요.' },
        { type: 'p', text: '두 상품 모두 **예금자보호 대상이 아니에요.** 펀드와 ETF에서 받는 이익은 배당소득으로 보고 소득세 14%와 지방소득세 1.4%, 합쳐 15.4%를 떼요(2026년 11월 확인). 다만 펀드가 국내 증권시장에 상장된 주식 등을 사고팔아 생긴 손익은 이 이익에 넣지 않아서, 무엇에 투자하느냐에 따라 세금이 달라져요.' },
      ],
    },
    {
      title: '🧭 자주 보는 펀드 용어',
      blocks: [
        {
          type: 'terms',
          items: [
            { term: '주식형·채권형·혼합형', desc: '자산의 60% 이상을 주식에 투자하면 주식형, 채권에 60% 이상이면 채권형, 둘 다 60% 미만이면 혼합형이에요.' },
            { term: '인덱스펀드', desc: '여러 종목에 나눠 투자해 시장 전체의 움직임을 따라가도록 운용하는 펀드예요. 일반적인 ETF가 이 방식이에요.' },
            { term: '거치식·적립식', desc: '한 번에 목돈을 넣는 방식이 거치식, 정기적으로 일정 금액을 넣는 방식이 적립식이에요.' },
            { term: '공모펀드·사모펀드', desc: '공모펀드는 불특정 다수의 투자자에게서, 사모펀드는 소수의 투자자에게서 돈을 모아요.' },
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
              q: 'ETF는 펀드인가요, 주식인가요?',
              a: '펀드예요. 거래소에 상장돼 주식처럼 거래될 뿐, 일반적인 ETF는 지수를 따라가는 인덱스펀드의 성격을 그대로 가지고 있어요.',
            },
            {
              q: '펀드에 가입하기 전에 무엇을 봐야 하나요?',
              a: '핵심 정보가 담긴 **간이투자설명서**와 1~6등급으로 표시된 **투자위험등급**을 확인하세요. 판매수수료, 환매수수료, 보수도 함께 보세요. 과거 수익률이 미래 수익률을 보장하지는 않아요.',
            },
          ],
        },
      ],
    },
  ],
  footer: {
    notes: [
      '*펀드와 ETF는 원금 손실이 생길 수 있고 예금자보호를 받지 못해요. 이 글은 특정 상품이나 금융회사를 추천하지 않아요.',
      '*거래 시간, 세율은 2026년 11월 4일에 확인한 한국거래소 자료와 소득세법(2026. 1. 1. 시행)·소득세법 시행령(2026. 10. 1. 시행) 기준이에요. 바뀔 수 있어요.',
      '*이 콘텐츠는 금융감독원, 한국거래소, 예금보험공사, 국가법령정보센터의 자료를 참고했어요.',
    ],
    sources: [
      { label: '금융감독원 e-금융교육센터: 성인을 위한 실용금융 (5)', url: 'https://www.fss.or.kr/edu/fec/contMng/view.do?contentsSlno=620&menuNo=300017' },
      { label: '한국거래소: ETF 개념 및 특징', url: 'https://open.krx.co.kr/contents/OPN/01/01030201/OPN01030201.jsp' },
      { label: '한국거래소: ETF 매매절차', url: 'https://regulation.krx.co.kr/contents/RGL/03/03060101/RGL03060101.jsp' },
      { label: '예금보험공사: 보호대상 금융상품 개요', url: 'https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do' },
      { label: '소득세법 제17조(배당소득)', url: 'https://www.law.go.kr/법령/소득세법/제17조' },
      { label: '소득세법 시행령 제26조의2(집합투자기구의 범위 등)', url: 'https://www.law.go.kr/법령/소득세법시행령/제26조의2' },
      { label: '소득세법 제129조(원천징수세율)', url: 'https://www.law.go.kr/법령/소득세법/제129조' },
      { label: '지방세법 제103조의13(특별징수의무)', url: 'https://www.law.go.kr/법령/지방세법/제103조의13' },
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
  'saving-vs-investing': savingVsInvesting,
  'deposit-vs-savings': depositVsSavings,
  'parking-vs-cma': parkingVsCma,
  'stock-basics': stockBasics,
  'kospi-vs-kosdaq': kospiVsKosdaq,
  'bond-basics': bondBasics,
  'fund-vs-etf': fundVsEtf,
};

/** 승인 전 글. npm run dev에서만 보이고 운영 번들에는 들어가지 않는다 */
const DRAFT_ARTICLES: Partial<Record<string, Draft>> = {
  'isa-vs-pension': isaVsPension,
  'housing-subscription': housingSubscription,
};

export const GUIDE_ARTICLES: Partial<Record<string, GuideArticle>> = import.meta.env.DEV ? { ...PUBLISHED_ARTICLES, ...DRAFT_ARTICLES } : PUBLISHED_ARTICLES;
