// /info-web 내용: 데스크톱 웹 솔파(solpa). 근거 문서: docs/PRD.md, docs/product/01·03·04, README 경로 표, docs/decisions/.
// 화면 이미지: public/landing/screens/*.webp(운영 캡처). 없는 화면과 협업 사진은 public/info/web/ 아래 같은 이름으로 넣으면 바뀐다.
import { InfoPage } from './InfoPage';
import { Link, Node, Tier } from './parts';
import { COLLAB_FLOW, COLLAB_RULES, COURSE } from './shared';
import type { InfoContent } from './types';

const S = '/landing/screens';
const P = '/info/web';

function Diagram() {
  return (
    <>
      <Tier label="사용자">
        <Node title="데스크톱 브라우저" sub="솔파 웹 · 로그인 없이 체험 가능" grow />
        <Node title="텅장관리 앱" sub="Android · 6자리 연동 코드 발급" />
      </Tier>
      <Link label="HTTPS" />
      <Tier label="진입" tone="subtle">
        <Node title="nginx" sub="solpa VM · Docker Compose" items={['웹 정적 파일(Vite 빌드)', '/api → 웹 백엔드 프록시']} grow />
        <Node title="Vercel" sub="main 머지 시 자동 배포" items={['앱 시연 /m']} />
      </Tier>
      <Link label="/api" />
      <Tier label="웹 백엔드" tone="brand">
        <Node title="api 프로세스" sub="Spring Boot 4.1 · Java 21" items={['auth · applink · seedmoney', 'market · insight · practice', 'virtualsim · goalscenario', 'savings · deposit · cashcatalog · news']} grow />
        <Node title="worker 프로세스" sub="같은 jar, 다른 역할" items={['시세 · 공시 · 업종 수집', '사건 탐지 · 근거 매칭', 'AI 개요 · 요약 · 조합 사전 생성', '청년 소식 매일 06:00 수집']} grow />
      </Tier>
      <Link label="JPA · Flyway" />
      <Tier label="데이터">
        <Node title="MySQL 8.4" sub="웹 전용 DB(로컬은 H2) · 앱 DB와 분리" grow />
      </Tier>
      <Link label="서버끼리만 호출" both />
      <Tier label="외부" tone="ext">
        <Node title="키움 · DART" sub="일봉 시세 · 공시" />
        <Node title="금감원 finlife" sub="예금 · 적금 공시" />
        <Node title="온통청년" sub="청년 정책 소식" />
        <Node title="Gemini · OpenAI" sub="사전 생성 + 자동 검사" />
        <Node title="앱 서버" sub="/internal/v1/web-links" />
      </Tier>
    </>
  );
}

export const WEB: InfoContent = {
  docTitle: '솔파 소개',
  brand: '솔파',
  brandSub: `솔파(solpa) · 텅장관리 데스크톱 웹 · ${COURSE}`,
  watermark: '臨戰無退',
  hero: {
    kicker: `${COURSE} · 최종 프로젝트`,
    illust: true,
    title: '청년을 위한 금융 파트너,\n솔파',
    lead: '첫 금융 선택 전에, 내가 아낀 돈으로 먼저 연습하는 입구. 앱에서 모은 시드머니로 지난 주식과 적금을 실험하고, 목표를 세우고, 청년 금융 소식을 챙기는 데스크톱 웹이에요.',
    visual: null,
  },
  origin: {
    title: '청년들은 돈 관리를\n어떻게 하고 있을까?',
    lead: '청년은 돈을 모으고 있어요. 그런데 그 돈이 무엇이 될지 그려 보고, 다음 선택을 연습할 곳이 없었어요. 기획은 이 빈칸에서 시작했어요.',
    stats: [
      { value: '76.5', unit: '%', label: '저축 · 투자 중인 청년, 매달 평균 94만 1천 원', viz: { kind: 'ring', pct: 76.5 } },
      { value: '80.2', unit: '%', label: '적금을 가진 청년. 저축은 적금에 머물러요', viz: { kind: 'ring', pct: 80.2 } },
      { value: '33.2', unit: '점', label: '20대 ‘재무 상황 점검’ 점수, 2년 사이 22.6점 하락', viz: { kind: 'bars', from: 55.8, to: 33.2, fromLabel: '2년 전', toLabel: '지금', max: 60 } },
      { value: '50.9', unit: '%', label: '2025년 새 주식 계좌 중 10~30대. 정보는 커뮤니티(44.4%)에서', viz: { kind: 'ring', pct: 50.9 } },
    ],
    source: '서민금융진흥원 「2024 청년금융 실태조사」, 한국은행 · 금융감독원 「2024 전국민 금융이해력 조사」, 언론 보도(신규 계좌)',
    pains: [
      { pain: '모은 돈의 다음 단계가 막막', icon: 'wallet', title: '내 시드머니에서 출발', desc: '가상의 1억이 아니라 앱에서 실제로 아껴 확정한 시드머니를 웹의 기준점으로 써요.', tag: '앱 연동 · 마이페이지' },
      { pain: '투자는 연습 없이 실전으로', icon: 'chart', title: '잃을 돈 없는 투자 연습', desc: '지난 시세 · 공시로 사건마다 판단하고, AI가 만든 가상 종목으로 매달 대회를 치러요.', tag: '인사이트 · 시뮬레이션' },
      { pain: '정보는 흩어지고 비교는 어려움', icon: 'book', title: '같은 기준의 비교와 소식', desc: '예적금 · 파킹 · CMA를 서버가 같은 규칙으로 계산하고, 청년 정책은 매일 모아 요약해요.', tag: '예적금 · 청년소식' },
    ],
    answer: '가상의 1억이 아니라 “지난 6개월 동안 내가 남긴 47만 원”으로 과거를 돌려 봐요.\n잃을 돈 없이 배우고, 다시 앱으로 돌아가 더 모을 이유를 얻어요.',
  },
  values: [
    { title: '“가상의 1억”이 아니라\n“내가 아낀 47만 원”', desc: '텅장관리 앱에 매일 기록하며 남긴 돈이 시드머니가 돼요. 증권사도, 계좌 연결 서비스도 “오늘 예산보다 덜 쓴 돈”은 몰라요.' },
    { title: '그래프가\n이야기가 된다', desc: '급등 · 급락 지점에 ▲▼ 사건 핀을 꽂고, 누르면 그때 나온 공시와 AI 개요로 “무슨 일이 있었는지”를 과거 사실로 설명해요. 미래 예측은 하지 않아요.' },
    { title: '앱 ↔ 웹\n하나의 루프', desc: '매일 기록(앱) → 주말 실험(웹) → 목표 설정(웹) → 다시 절약(앱). 게임처럼 쌓이는 저축 습관을 “배움”으로 이어요.' },
  ],
  journey: {
    title: '앱에서 모으고,\n웹에서 연습해요',
    lead: '두 서비스는 서버 · DB · 계정이 따로지만, 사용자가 원하면 [앱 연동하기] 한 번으로 하나의 흐름이 돼요.',
    steps: [
      { title: '앱 · 매일', desc: '오늘 쓸 수 있는 돈을 확인하고 지출을 기록해요. 예산을 지키면 캐릭터가 자라요.' },
      { title: '수입일 전날 · 시드머니 확정', desc: '이번 달 남긴 돈을 시드머니에 반영해요(매달 저축할 돈 / 남은 돈 전부 / 직접 입력).' },
      { title: '앱 연동하기', desc: '앱에서 받은 6자리 코드(10분 · 1회)를 웹에 입력하면, 확정된 시드머니만 서버끼리 받아 와요. 거래 원본은 넘어오지 않아요.' },
      { title: '웹 · 주 1~2회 연습', desc: '투자 인사이트 · 시뮬레이션 · 예적금 비교 · AI 목표설계 · 청년 소식으로 내 돈의 다음 선택을 연습해요.' },
      { title: '다시 앱으로', desc: '“매달 5만 원만 더 남기면” 달라지는 결과를 보고, 앱으로 돌아가 더 아껴요.' },
    ],
  },
  features: {
    title: '로그인 없이도\n모든 화면을 체험해요',
    lead: '모든 메뉴는 로그인 없이 열려요. 저장 · 연동처럼 계정이 필요한 동작에서만 로그인을 받아요.',
    frame: 'browser',
    items: [
      { name: '랜딩 · 체험 시작', where: '/home', img: `${P}/screens/home.webp`, head: '첫 화면에서\n30초 안에 첫 결과', desc: '랜딩의 예시 차트에서 ▲▼ 핀을 바로 눌러 보고, [체험 시작하기]로 로그인 없이 모든 화면에 들어가요.', points: ['예시 데이터에는 늘 “예시” 표시', '첫 방문 안내 · 사용법 다시 보기'] },
      { name: '계정 · 앱 연동 · 시드머니', where: '/mypage', img: `${P}/screens/mypage.webp`, head: '앱에서 모은 돈이\n웹의 시작 금액이 돼요', desc: '이메일 · 카카오 · Google로 가입하고, 앱에서 받은 6자리 코드로 연동하면 확정 시드머니와 주기별 반영 기록을 받아 “시드머니가 쌓인 모양” 꺾은선으로 보여 줘요. 웹에서 고친 총액은 앱에도 돌려보내요.', points: ['웹 회원당 연동 하나 · 언제든 해제', '거래 원본은 받지 않음', '내 정보: 테마(라이트/다크) · 구독 · 탈퇴'] },
      { name: '금융 가이드', where: '/guide', img: `${P}/screens/guide.webp`, head: '처음 쓰는 사람을 위한\n금융 기초 안내', desc: '예적금 · 주식 · ETF 같은 개념을 카테고리별 글로 차근차근 설명해요.', points: ['금융 기초 · 저축과 투자 두 갈래'] },
      { name: '내 투자 성향', where: '/type', img: `${S}/type.webp`, head: '나에게 맞는 비율부터\n차근차근 알아봐요', desc: '질문 12개로 5가지 유형 중 가까운 성향을 참고로 보고, 직접 골라요. 고른 성향의 패시브 · 액티브 비율과 지난 3년 결과, 흔히 담는 상품 유형을 보여 줘요.', points: ['안정형부터 공격투자형까지 5단계', '결과는 참고, 결정은 사용자가'] },
      { name: '투자 인사이트', where: '/invest', img: `${S}/invest.webp`, head: '지난 주가 위의 ▲▼ 핀으로\n그때 무슨 일이 있었는지', desc: '흐르는 시장 띠 · 시가총액과 업종별 순위 · 최대 3종목 주가 비교. ▲▼ 핀을 누르면 그때 나온 DART 공시와 AI 개요 · 사실 카드를 읽어요.', points: ['기간 3개월 · 6개월 · 1년 · 3년', 'AI 개요는 미리 만들고 자동 검사 후 공개'] },
      { name: '투자 시뮬레이션 · 과거 시장 연습', where: '/simulation?mode=past', img: `${S}/sim.webp`, head: '지난 시장으로 들어가\n사건마다 직접 판단해 봐요', desc: '업종을 펼쳐 종목을 고르거나 무작위로 받아 지난 일봉을 하루씩 재생해요. 공시가 나오면 멈추고 매수 · 유지 · 매도를 골라요. 실제 주문은 없어요.', points: ['120~250거래일, 공시 문제 3개 이상', '「공시 읽는 법」 단독 글'] },
      { name: '가상 시뮬레이션 · 월간 대회', where: '/simulation?mode=contest', img: `${P}/screens/contest.webp`, head: 'AI가 만든 가상 종목으로\n매달 겨루는 대회', desc: 'AI가 만든 가상 종목 · 사건 글과, 수집한 5년치 공시 · 시세에서 뽑은 룰셋으로 서버가 가상 시세를 만들어요. 회원은 실제 과거 공시 10문제 배치고사로 1천만 · 5천만 · 1억 판을 정하고, “유지만 했을 때”보다 나은 판단으로 점수를 쌓아 승급해요.', points: ['사건마다 이후 5거래일 등락과 과거 통계', '배치고사 공시마다 읽는 법 안내', '익명 별명 · 판별 상위 100위 랭킹'] },
      { name: 'AI 목표설계', where: '/goal', img: `${S}/goal.webp`, head: '목표까지 가는 길,\n세 가지 방법으로 비교해요', desc: '시작 금액 · 월 납입 가능액 · 기한을 넣으면 안정 · 균형 · 적극 세 조합을 지난 60개월 수익률로 만든 2,000개 경로로 계산해 결과 범위(하위 10% · 중간 · 상위 10%), 달마다 자산 추이, 원금 손실 가능성을 보여 줘요. 시작 금액의 적금 몫은 기한에 맞는 은행 정기예금에 맡겨 계산해요.', points: ['조합은 worker가 기한마다 미리 만든 AI 조합', '위험 수준 배지 · 회원은 이름 붙여 저장', '추정치이며 수익 · 달성을 보장하지 않아요'] },
      { name: '예적금 · 파킹 · CMA', where: '/savings · /deposit · /parking · /cma', img: `${S}/savings.webp`, head: '같은 금액, 같은 기간으로\n만기 수령액을 한눈에', desc: '금감원 공시 적금 · 정기예금과 청년 정책 적금, 금융사 공식 안내에서 모은 파킹통장 · CMA를 서버가 같은 규칙으로 계산해 최대 3개까지 나란히 비교해요. 계산할 수 없는 상품은 그 이유를 함께 알려요.', points: ['적금 월 납입 기본값 = 앱의 매달 저축할 돈', '추천 순위 · 가입 버튼 없음', '청년 · 비대면 · 급여 등 분류 태그'] },
      { name: '청년 금융 소식', where: '/news', img: `${S}/news.webp`, head: '놓치기 쉬운 청년 정책,\n마감 가까운 순으로', desc: '온통청년의 청년 정책을 매일 06:00 모아 AI로 요약하고, 원문 숫자와 대조 검사를 통과한 소식만 공개해요. 마감 임박순 · 요즘 많이 본 지원금 · 조건으로 찾기로 “신청 가능성이 높아요 / 추가 확인이 필요해요”를 나눠 보여 줘요.', points: ['조건 입력은 저장 · 전송하지 않음', '공고문으로 바로 이동 · 챙기기'] },
      { name: '플러스 구독', where: '/plus', img: `${P}/screens/plus.webp`, head: '무료로 충분히,\n더 깊게는 월 990원', desc: '사건 설명 · 소식 · 적금 비교는 모두 무료예요. 저장 개수 확대 · 정밀 모드 · 리마인더 · 리포트가 플러스예요. 지금은 저장하지 않는 모의 결제예요.', points: ['월 990원 · 연 9,900원', '토스 정기결제로 바꿀 수 있게 설계'] },
    ],
  },
  tech: {
    title: '화면은 가볍게,\n계산은 서버에서',
    lead: '프론트는 화면과 캐시만, 금액 · 수익률 · 이자 계산과 데이터 수집은 백엔드가 맡아요.',
    stack: [
      { group: '프론트엔드', items: ['React 19', 'TypeScript 5.9', 'Vite 8', 'React Router 7', 'TanStack Query 5', 'Canvas 직접 그린 주가 차트'] },
      { group: '백엔드', items: ['Spring Boot 4.1', 'Java 21', 'Spring Security · JWT', 'JPA · Flyway', 'api / worker 2 프로세스'] },
      { group: '데이터 · AI', items: ['MySQL 8.4', '키움 시세 · DART 공시', '금감원 finlife', '온통청년', 'Gemini · OpenAI(사전 생성)'] },
      { group: '인프라 · 배포', items: ['솔파 VM · Docker Compose', 'nginx', 'GitHub Actions(self-hosted runner CD)', 'Vercel(앱 시연 /m)'] },
      { group: '계약 · 품질', items: ['OpenAPI 3 계약(web-api.yaml)', 'openapi-typescript 타입 생성', 'Prism 목 서버', '백엔드 ContractTest', '정책 예시 표 = tests/policy'] },
      { group: '디자인 시스템', items: ['tokens.css 단일 토큰', '브랜드 블루 하나', '상승 빨강 ▲ · 하락 파랑 ▼', '라이트 기본 · 다크 선택', 'Pretendard'] },
    ],
  },
  arch: {
    title: '앱과 웹은\n서버 · DB · 계정이 따로',
    lead: '시세 수집과 시뮬레이션 부하가 앱에 영향을 주지 않게, 웹은 자기 VM에서 자기 서버와 DB로 운영해요. 브라우저는 웹 백엔드만 부르고, 앱 정보는 서버끼리만 주고받아요.',
    diagram: <Diagram />,
    notes: [
      { tag: '경계', title: '연동은 코드로만', desc: '같은 이메일이라도 계정을 자동으로 합치지 않아요. 앱에서 받은 6자리 코드(10분 · 1회)로만 연동하고, 웹 회원당 연동은 하나예요.' },
      { tag: '최소 범위', title: '확정값만 주고받기', desc: '앱 회원 정보와 확정 시드머니 · 주기별 반영 기록만 받아요. 거래 원본과 카테고리는 넘어오지 않아요.' },
      { tag: '프로세스 분리', title: 'api와 worker', desc: '같은 jar를 요청 처리(api)와 수집 · 탐지 · AI 사전 생성(worker) 두 역할로 띄워, 무거운 배치가 응답 속도를 해치지 않게 해요.' },
      { tag: '배포', title: 'main 머지 = 반영', desc: 'main에 머지되고 CI가 통과하면 VM의 GitHub Actions 러너가 자동으로 반영해요. 운영 배포를 손으로 하지 않아요.' },
    ],
  },
  principles: {
    title: '숫자를 다루는 서비스라서\n지킨 원칙',
    lead: '금융 숫자는 틀리면 신뢰를 잃어요. 그래서 계산 위치 · AI 사용 범위 · 화면 문구까지 원칙으로 정했어요.',
    items: [
      { tag: 'ADR-3', title: '계산은 서버가 한다', desc: '금액 · 수익률 · 이자는 서버가 원 단위 정수로 계산하고, 나눗셈은 내림이에요. 화면은 서버 값을 그대로 보여 주고, 움직임은 표시에만 써요.' },
      { tag: 'ADR-6', title: 'AI는 미리 만들고 검사한 뒤 공개', desc: '사건 개요 · 소식 요약 · 목표 조합은 worker가 미리 만들고 자동 검사를 통과한 것만 보여 줘요. 요청 중에는 AI를 부르지 않아 2초 안에 답해요.' },
      { tag: '정책 = 테스트', title: '규칙은 예시 표로, 표는 테스트로', desc: 'policies.md의 입력 → 기대값 표를 tests/policy JSON으로 옮겨 백엔드 테스트가 그대로 읽어 검사해요.' },
      { tag: '계약', title: 'OpenAPI가 응답의 정본', desc: '응답이 web-api.yaml과 다르면 ContractTest가 CI를 실패시켜요. 프론트 타입은 계약에서 생성해요.' },
      { tag: '고지', title: '과거 사실만, 보장 없이', desc: '사건 설명은 과거 사실만, 모든 계산 결과에는 가상 · 추정 고지를 붙이고 수익이나 목표 달성을 보장하지 않아요. 실제 매매 · 가입 중개는 하지 않아요.' },
      { tag: '디자인', title: '토큰 하나로 일관되게', desc: '색 · 모서리 · 간격은 tokens.css 토큰만 써요. 강조 색은 브랜드 블루 하나, 등락은 늘 ▲▼와 함께 표시해 색만으로 구분하지 않아요.' },
    ],
  },
  collab: {
    title: '저장소 하나를 기준으로,\n사람과 AI가 같이',
    lead: '기획 · 디자인 · 프론트 · 백엔드 · 앱이 한 저장소의 문서를 기준으로 Issue 단위로 일했어요.',
    flow: COLLAB_FLOW,
    rules: COLLAB_RULES,
  },
  story: {
    title: '4주 동안\n우리가 지나온 길',
    lead: '회의에서 정한 것을 문서로 옮기고, 문서를 코드로, 코드를 운영으로 옮긴 기록이에요.',
    numbers: [
      { value: '930', unit: '+', label: '커밋' },
      { value: '430', unit: '+', label: 'PR · Issue' },
      { value: '46', unit: '건', label: '결정 기록' },
      { value: '11', unit: '개', label: '핵심 기능' },
    ],
    timeline: [
      { date: '10.18', title: '1차 기획 회의', desc: '앱에서 모은 돈으로 웹에서 연습한다는 루프와 기능 범위를 정했어요.' },
      { date: '10.19', title: '웹 저장소 시작', desc: 'Vite · React · TypeScript로 flexable-web을 따로 만들었어요.' },
      { date: '10.20', title: '앱 · 웹 서비스 분리', desc: '서버 · DB · 계정을 나누고, 6자리 코드 연동으로만 정보를 주고받기로 했어요.' },
      { date: '10.21', title: '솔파 VM 운영 시작', desc: 'solpa.shinhanacademy.co.kr에 nginx · 웹 백엔드 · MySQL을 올렸어요.' },
      { date: '10.25', title: '작업 방식 정립', desc: '저장소 기준본 · Issue 단위 · spec-change · OpenAPI 계약 · CODEOWNERS를 도입했어요.' },
      { date: '10.26', title: '투자 인사이트 · 시뮬레이션 분리', desc: '주가를 보는 화면과 사건마다 판단해 보는 연습 화면을 나눴어요.' },
      { date: '11.01', title: '기능 동결', desc: '남은 Must를 정리하고 실측 · 시연 준비에 들어갔어요.' },
      { date: '11.05', title: '가상 시뮬레이션 · 월간 대회', desc: 'AI가 만든 가상 종목과 배치고사 · 승급 대회를 더했어요.' },
      { date: '11.14', title: 'AI 목표설계 개편', desc: '입력한 월 금액으로 2,000개 경로를 계산하는 방식으로 바꿨어요.' },
    ],
    photos: [
      { src: `${P}/collab/1.webp`, caption: '첫 기획 회의 — 문제 정의와 타깃 정하기', wide: true },
      { src: `${P}/collab/2.webp`, caption: '화면 설계 · 와이어프레임 리뷰' },
      { src: `${P}/collab/3.webp`, caption: 'API 계약 맞추기' },
      { src: `${P}/collab/4.webp`, caption: 'PR 리뷰와 CI 확인' },
      { src: `${P}/collab/5.webp`, caption: '시연 리허설' },
      { src: `${P}/collab/6.webp`, caption: '팀 사진', wide: true },
    ],
  },
  outro: {
    title: '첫 금융 선택 전에,\n솔파에서 먼저 연습해요',
    lead: '내가 아낀 돈으로, 잃을 걱정 없이.',
    links: [
      { label: '웹', url: 'solpa.shinhanacademy.co.kr' },
      { label: '저장소', url: 'github.com/shinds-team7/flexable-web' },
      { label: '앱 소개', url: '/info-app' },
    ],
  },
};

export default function InfoWeb() {
  return <InfoPage c={WEB} variant="web" />;
}
