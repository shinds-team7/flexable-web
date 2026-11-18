// /info-app 내용: 생활비 관리 앱 텅장관리. 근거 문서: 앱 저장소(shinds-team7/flexable-app) docs/PRD.md · FEATURES.md · ARCHITECTURE.md.
// 화면 이미지: public/landing/app/*.webp(앱 캡처). 없는 화면은 public/info/app/ 아래 같은 이름으로 넣으면 바뀐다.
import { InfoPage } from './InfoPage';
import { Link, Node, PhoneShot, Tier } from './parts';
import { COLLAB_FLOW, COLLAB_RULES, COURSE } from './shared';
import type { InfoContent } from './types';

const A = '/landing/app';
const P = '/info/app';

function HeroVisual() {
  return (
    <div className="info-hero-app">
      <div className="l">
        <PhoneShot src={`${A}/splash.webp`} alt="텅장관리 시작 화면" />
      </div>
      <div className="c">
        <PhoneShot src={`${A}/home.webp`} alt="텅장관리 홈 화면(예시 데이터)" />
      </div>
      <div className="r">
        <PhoneShot src={`${A}/tx.webp`} alt="텅장관리 거래 내역 화면(예시 데이터)" />
      </div>
    </div>
  );
}

function Diagram() {
  return (
    <>
      <Tier label="클라이언트">
        <Node title="Android 앱" sub="Google Play 2.0.1" items={['Expo SDK 57 · React Native 0.86', 'Expo Router · TypeScript']} grow />
        <Node title="웹" sub="같은 Expo 코드 · Vercel" items={['서비스 · 약관 · 고객지원']} grow />
      </Tier>
      <Link label="HTTPS · JWT" />
      <Tier label="진입" tone="subtle">
        <Node title="Caddy" sub="EC2 · Docker · 자동 HTTPS" grow />
      </Tier>
      <Link label="/api/v1" />
      <Tier label="API 서버" tone="brand">
        <Node title="Spring Boot 4.1" sub="Java 21 · Spring Security(JWT) · JPA" items={['auth · user · budget', 'transaction · category · analysis', 'coin · outfit · referral', 'weblink(웹 연동)']} grow />
        <Node title="서버 계산" sub="모든 금액의 최종값" items={['오늘 쓸 수 있는 돈', '요일별 배분', '예정 지출 반영', '시드머니']} grow />
      </Tier>
      <Link label="Flyway 마이그레이션" />
      <Tier label="데이터">
        <Node title="MySQL 8" sub="AWS RDS(로컬은 H2)" grow />
      </Tier>
      <Link label="서버끼리만 호출" both />
      <Tier label="외부" tone="ext">
        <Node title="Gemini" sub="AI 메이트 · 문서 읽기" />
        <Node title="솔파 웹 서버" sub="/internal/v1/web-links" />
        <Node title="EAS" sub="Build · 원격 Update" />
        <Node title="GitHub Actions" sub="CI · 서버 15분 감시" />
      </Tier>
    </>
  );
}

export const APP: InfoContent = {
  docTitle: '텅장관리 소개',
  brand: '텅장관리',
  brandSub: `텅장관리(Flex-able) · Android 생활비 관리 앱 · ${COURSE}`,
  watermark: '臨戰無退',
  hero: {
    kicker: `${COURSE} · 최종 프로젝트`,
    title: '오늘 쓸 돈을 지키는\n가장 쉬운 방법,\n텅장관리',
    lead: '이번 수입일까지, 오늘 얼마 써도 되는지. 사회초년생이 직접 입력한 잔액 · 수입일 · 고정지출과 기록한 거래로 서버가 “오늘 쓸 수 있는 돈”을 계산해 보여 주는 생활비 관리 앱이에요.',
    visual: <HeroVisual />,
  },
  origin: {
    title: '“월급날까지\n버틸 수 있을까?”',
    lead: '첫 월급을 받은 사회초년생에게 가장 어려운 질문은 “얼마나 모을까”가 아니라 “오늘 얼마 써도 될까”였어요.',
    stats: [
      { value: '49.9', unit: '%', label: '청년이 꼽은 가장 어려운 재무 문제: 생활비 상승에 따른 지출 증가', viz: { kind: 'ring', pct: 49.9 } },
      { value: '36.1', unit: '점', label: '20대 ‘장기 재무목표’ 점수, 2년 사이 11.9점 하락', viz: { kind: 'bars', from: 48.0, to: 36.1, fromLabel: '2년 전', toLabel: '지금', max: 60 } },
      { value: '76.5', unit: '%', label: '저축 · 투자 중인 청년. 모으고는 있지만 기준이 없어요', viz: { kind: 'ring', pct: 76.5 } },
    ],
    source: '서민금융진흥원 「2024 청년금융 실태조사」, 한국은행 · 금융감독원 「2024 전국민 금융이해력 조사」',
    pains: [
      { pain: '월말 생활비 부족', icon: 'calendar', title: '일일 예산 관리', desc: '잔액에서 고정지출 · 카드값 · 저축할 돈을 먼저 떼고, 월급날까지 하루 단위로 나눠요.', tag: '오늘 쓸 수 있는 돈' },
      { pain: '가계부는 지루함', icon: 'coin', title: '지키면 자라는 보상', desc: '예산을 지킨 날만큼 캐릭터가 자라고, 출석 · 예산 준수로 코인과 코스튬을 얻어요.', tag: '캐릭터 · 코인' },
      { pain: '남은 돈이 사라짐', icon: 'wallet', title: '시드머니로 옮기기', desc: '월급 전날 남은 돈을 시드머니로 옮기는 순간을 만들어, 아낀 돈이 자산으로 쌓여요.', tag: '시드머니 · 웹 연동' },
    ],
    answer: '잔액 · 수입일 · 고정지출만 넣으면 서버가 매일 “오늘 쓸 수 있는 돈”을 계산해요.\n예산을 지키면 캐릭터가 자라고, 남은 돈은 시드머니로 모여요.',
  },
  values: [
    { title: '잔액이 아니라\n“오늘 쓸 수 있는 돈”', desc: '다음 수입일까지 남은 생활비에서 고정지출 · 카드 미결제액 · 예정 지출을 빼고 요일 비중대로 나눠, 오늘 하루 예산 한 숫자로 보여 줘요.' },
    { title: '지키면\n자라는 캐릭터', desc: '예산을 지키고 출석하면 광부에서 왕족까지 6단계로 자라는 캐릭터와 코인 · 코스튬으로, 기록이 보상이 돼요.' },
    { title: '남긴 돈은\n시드머니로', desc: '수입일 전날 남은 돈을 시드머니로 옮겨 모으고, 원하면 데스크톱 웹 솔파에서 그 돈으로 투자 · 적금을 연습해요.' },
  ],
  journey: {
    title: '처음 5분 설정,\n그다음은 매일 한 번',
    lead: '처음에 한 번 예산을 설정하면, 그다음부터는 기록만 하면 돼요.',
    steps: [
      { title: '초기 예산 설정 5단계', desc: '잔액 → 수입(수입일 · 수입액 · 카드 미결제액) → 고정지출 → 매달 저축할 돈 → 완료. 거래내역서 PDF로 가입 전 거래도 가져와요.' },
      { title: '매일 홈에서 확인', desc: '오늘 · 이번 주 쓸 수 있는 돈과 다음 수입일까지 남은 생활비를 캐릭터 홈에서 봐요.' },
      { title: '쓰면 바로 기록', desc: '직접 입력 · 결제 스크린샷 · 음성 · 카드 앱 알림 자동 기록 중 편한 방법으로 남겨요.' },
      { title: '수입일 전날 · 시드머니 반영', desc: '20시 알림이 오면 이번 달 남긴 돈을 시드머니로 옮겨요(매달 저축할 돈 / 남은 돈 전부 / 직접 입력).' },
      { title: '웹에서 연습', desc: '설정에서 6자리 코드를 받아 솔파에 연동하면, 모은 시드머니로 투자 · 적금을 연습해요.' },
    ],
  },
  features: {
    title: '기록부터 모으기까지,\n앱 하나로',
    lead: '모든 금액 계산과 저장은 앱 서버가 하고, 앱은 결과를 그려요. 화면 숫자는 “입력한 잔액 · 기록 기준 추정”이에요.',
    frame: 'phone',
    items: [
      { name: '초기 예산 설정', where: '첫 실행 · 마이 > 예산 설정 바꾸기', img: `${P}/screens/onboarding.webp`, head: '다섯 단계면\n내 예산이 완성돼요', desc: '잔액(생활비 · 모아둔 돈) → 수입(수입일 · 수입액 · 카드 미결제액) → 고정지출 → 매달 저축할 돈 → 완료. 거래내역서 PDF(신한은행 · KB국민은행)를 올리면 서버가 읽어 가입 전 거래를 한 번에 저장해요.', points: ['PDF · 비밀번호는 저장하지 않음', '저장된 설정은 한 화면에서 다시 고침'] },
      { name: '오늘 쓸 수 있는 돈', where: '홈', img: `${A}/home.webp`, head: '오늘 하루 예산을\n한 숫자로', desc: '잔액에서 고정지출 · 카드 미결제액 · 저축할 돈 · 예정 지출을 먼저 떼고, 다음 수입일까지 하루 단위로 나눠요. 기록할 때마다 서버가 다시 계산하고, 수입일이 주말 · 공휴일이면 다음 평일로 봐요.', points: ['서버 계산이 최종값', '승급 게이지 · 계산 근거 보기'] },
      { name: '요일별 생활비 배분', where: '홈 > 요일별 배분', img: `${P}/screens/weights.webp`, head: '주말에 더 쓰는 나에게\n맞춘 하루 예산', desc: '기본 · 내 기록 기준 · 주말 넉넉히 · 평일 넉넉히 프리셋을 고르거나 요일 막대를 끌어 직접 조정해요. 총 생활비는 그대로 두고 요일별 하루 예산만 다시 나눠요.' },
      { name: '거래 기록', where: '내역 · 하단 + 버튼', img: `${A}/tx.webp`, head: '쓰는 방식 그대로\n편하게 기록해요', desc: '직접 입력, 결제내역 스크린샷, 음성 입력에 더해 카드 앱(신한 SOL페이 · 삼성 · 현대 · KB Pay · 롯데 · NH pay) 결제 알림 자동 기록과 토스 · 카카오뱅크 · 카카오페이 거래내역 스크린샷 가져오기를 지원해요. 고정지출은 날짜가 되면 자동으로 기록돼요.', points: ['알림 자동 기록은 선택 동의 · 기본 꺼짐', '스크린샷은 기기 안에서만 읽음', '가맹점 이름으로 카테고리 추정'] },
      { name: '소비 분석', where: '분석', img: `${P}/screens/analysis.webp`, head: '어디에 썼는지\n기간별로 한눈에', desc: '이번 달 · 이번 주 · 전체(3개월 · 6개월 · 1년) 카테고리별 · 일별 합계를 도넛과 막대로 보여 주고, 카테고리를 누르면 그 거래 목록으로 내려가요.' },
      { name: '예정 지출', where: '내역 > 예정 · 홈', img: `${P}/screens/planned.webp`, head: '다가올 약속을\n미리 예산에', desc: '미래 날짜의 지출을 등록하면 수입일 전날까지의 예정 금액을 남은 생활비에서 먼저 떼고, 그날 하루 예산에 더해요. 내역에서 눌러 따로 열린 상세 화면에서 고치고 지워요.' },
      { name: 'AI 메이트', where: '홈 > AI 메이트', img: `${P}/screens/mate.webp`, head: '내 소비를 아는\nAI 친구', desc: 'Gemini가 서버 계산 예산과 카테고리별 합계로 소비 흐름을 설명하고 아끼는 방법을 추천해요. “금요일 저녁 술약속”이라고 말하면 지난 기록으로 쓸 금액을 예측해 예정 지출 등록을 묻고, 받은 수입 · 쓴 돈도 기록 추가 · 수정을 제안해요.', points: ['말투 3가지 · 음성 질문', '바꾸는 일은 제안만, [반영]해야 저장', '거래 제목 · 메모는 AI에 보내지 않음'] },
      { name: '시드머니', where: '홈 > 시드머니 카드', img: `${P}/screens/seed.webp`, head: '남긴 돈이\n사라지지 않게', desc: '수입일 전날 20시 알림으로 이번 달 남긴 돈을 옮겨요(매달 저축할 돈 / 남은 돈 전부 / 직접 입력). 지금 예산에서 바로 보내기도 되고, 총액이 다르면 생활비는 그대로 둔 채 정정해요.', points: ['지금까지 모은 돈 · 이번 달 모을 돈', '모은 기록 · 총액 정정'] },
      { name: '캐릭터 · 코인 · 상점', where: '홈 · 마이 > 꾸미기', img: `${P}/screens/shop.webp`, head: '광부에서 왕족까지,\n지킬수록 자라요', desc: '예산을 지키고 출석하면 고양이 캐릭터가 광부 · 농부 · 상인 · 기사 · 귀족 · 왕족 6단계로 자라고 단계별 코스튬이 열려요. 앱 안에서만 쓰는 코인으로 테마 코스튬을 사고, 출석 7일째엔 굴비 코스튬을 받아요.', points: ['신규 가입 500코인 · 출석 · 광고 보상', '추천 코드 양쪽 100코인', '코인은 현금으로 바꿀 수 없음'] },
      { name: '알림', where: '알림함 · 마이 > 알림', img: `${P}/screens/notice.webp`, head: '잊지 않게,\n기기 안에서 조용히', desc: '최근 30일 알림함, 수입일 전날 알림, 시간을 고르는 기록 알림, Android 알림창에 오늘 남은 예산 상시 표시(기록 · 홈 버튼)를 지원해요. 서버 푸시는 쓰지 않아요.' },
      { name: '사용 안내', where: '첫 홈 · 마이 > 사용법 다시 보기', img: `${P}/screens/guide.webp`, head: '처음 열면\n하나씩 짚어 줘요', desc: '첫 홈에서 11단계 사용 가이드가 화면 요소를 하나씩 비춰 설명하고, 레벨 안내와 고객지원 FAQ로 언제든 다시 볼 수 있어요.' },
      { name: '웹사이트 연동', where: '마이 > 웹사이트 연동', img: `${P}/screens/weblink.webp`, head: '모은 돈으로\n웹에서 연습까지', desc: '선택 동의 후 6자리 코드(10분 · 1회)를 받아 솔파에 입력하면, 회원 정보와 확정 시드머니만 서버끼리 전달해요. 거래 원본은 넘기지 않아요.' },
    ],
  },
  tech: {
    title: '한 코드로 Android와 웹,\n계산은 서버 하나',
    lead: 'Expo로 Android와 웹을 같은 코드로 만들고, 모든 계산과 저장은 Spring Boot API 서버가 맡아요.',
    stack: [
      { group: '앱 · 웹', items: ['Expo SDK 57', 'React Native 0.86', 'Expo Router', 'TypeScript'] },
      { group: '백엔드', items: ['Spring Boot 4.1', 'Java 21', 'Spring Security · JWT', 'JPA · Flyway'] },
      { group: '데이터 · AI', items: ['MySQL 8(AWS RDS)', 'Gemini(AI 메이트 · 문서 읽기)', '기기 안 OCR(스크린샷)'] },
      { group: '인프라 · 배포', items: ['AWS EC2 · Docker', 'Caddy(자동 HTTPS)', 'EAS Build · 원격 Update', 'Vercel(웹)', 'Google Play'] },
      { group: '품질', items: ['Playwright E2E', 'GitHub Actions CI', '운영 서버 15분 감시', 'OpenAPI 연동 계약'] },
      { group: '로그인', items: ['이메일', '카카오', 'Google(PKCE)'] },
    ],
  },
  arch: {
    title: '앱은 그리고,\n서버가 계산해요',
    lead: '온라인 전용 구조예요. 모든 계산과 저장은 API 서버가 하고, 앱은 결과를 그려요. 웹 솔파에는 사용자가 연동했을 때만 서버끼리 최소한의 정보를 줘요.',
    diagram: <Diagram />,
    notes: [
      { tag: '요청 한 번의 길', title: '화면 → 서비스 → API → DB', desc: '거래 수정이라면 화면 경로 파일 → 서비스 폼 → API 클라이언트 → PATCH /api/v1/transactions/{id} → 컨트롤러 → 서비스 → MySQL 순서로 지나가요.' },
      { tag: '배포 갈래', title: '바뀐 것에 따라 다르게', desc: '웹은 main 머지로 Vercel 자동 배포, 앱 JS · 이미지는 EAS 원격 업데이트(재설치 없이), 네이티브 변경은 새 빌드로 Play 업로드, 백엔드는 배포 스크립트로 반영해요.' },
      { tag: '웹 연동', title: 'weblink 패키지가 경계', desc: '앱의 연동 코드 발급 · 목록 · 해제와 웹 서버 전용 /internal/v1/web-links/*를 한 패키지에 모아, 앱과 웹의 경계를 코드에서도 분리했어요.' },
      { tag: '의존 방향', title: '공통 UI는 그리기만', desc: '공통 컴포넌트는 값을 props로 받아 표시만 하고, 데이터는 서비스 쪽이 넘겨요.' },
    ],
  },
  principles: {
    title: '매일 여는 앱이라서\n지킨 원칙',
    lead: '돈 이야기는 정확해야 하고, 매일 쓰는 앱은 가벼워야 해요.',
    items: [
      { tag: '서버 계산', title: '최종값은 서버가', desc: '“오늘 쓸 수 있는 돈” · 요일 배분 · 예정 지출 반영은 모두 서버가 계산한 값이 최종값이에요. 계산식은 API 문서와 정책 표에 있어요.' },
      { tag: '정직한 문구', title: '추정이라고 말하기', desc: '화면 숫자는 “입력한 잔액 · 기록 기준 추정”이에요. 실제 은행 잔액과 다를 수 있다고 알려요.' },
      { tag: '선택 동의', title: '민감한 기능은 기본 꺼짐', desc: '카드 알림 자동 기록 · 상시 알림 · 웹 연동은 사용자가 직접 켜야 동작해요. 스크린샷은 기기 안에서만 읽어요.' },
      { tag: 'AI 제안', title: 'AI는 제안만, 결정은 사용자', desc: 'AI 메이트가 예산 배분 · 예정 지출을 바꾸자고 해도 사용자가 [반영]을 눌러야 저장돼요.' },
      { tag: '보상', title: '코인은 앱 안에서만', desc: '코인은 현금이나 다른 재화로 바꾸거나 다른 회원에게 넘길 수 없어요(약관 제2조 4).' },
      { tag: '안정성', title: '버그는 기록하고 규칙으로', desc: 'Android 저장 후 빈 화면 같은 버그는 원인 분석 문서와 재발 방지 규칙으로 남기고, 운영 서버는 15분마다 감시해요.' },
    ],
  },
  collab: {
    title: '저장소 하나를 기준으로,\n사람과 AI가 같이',
    lead: '앱 저장소도 웹과 같은 작업 방식을 써요. 기준 문서 · Issue · PR · CI 규칙이 같아서 두 저장소를 오가며 일할 수 있었어요.',
    flow: COLLAB_FLOW,
    rules: COLLAB_RULES,
  },
  story: {
    title: '첫 커밋부터\nPlay 스토어 출시까지',
    lead: '팀 프로젝트 앱으로 시작해, 실제 스토어에 올린 서비스가 되기까지의 기록이에요.',
    numbers: [
      { value: '830', unit: '+', label: '커밋' },
      { value: '2.0.1', label: 'Play 스토어 버전' },
      { value: '20', unit: '건', label: '결정 기록' },
      { value: '12', unit: '개', label: '핵심 기능' },
    ],
    timeline: [
      { date: '10.09', title: '앱 저장소 시작', desc: '사회초년생 생활비 관리 앱으로 첫 커밋을 올렸어요.' },
      { date: '10.18', title: '앱 · 웹 루프 기획', desc: '앱에서 남긴 돈을 웹에서 연습하는 루프로 두 서비스를 이었어요.' },
      { date: '10.20', title: '서비스 경계 분리', desc: '앱과 웹의 서버 · DB · 계정을 나누고 6자리 코드 연동 API를 만들었어요.' },
      { date: '10.25', title: '작업 방식 통일', desc: '웹과 같은 AGENTS.md · Issue · PR · spec-change 규칙을 앱에도 적용했어요.' },
      { date: '10.30', title: '예정 지출', desc: '다가올 약속을 미리 등록해 하루 예산에 반영하게 했어요.' },
      { date: '11.11', title: 'Play 스토어 2.0.1 출시', desc: 'Google Play 프로덕션에 2.0.1을 출시했어요(최소 지원 버전 2.0.1).' },
      { date: '11.14', title: '2.1.0 준비', desc: '카드 5사 · NH pay 알림 자동 기록, KB국민은행 거래내역서, 기본 카테고리 개편(지출 12 · 수입 6)을 담았어요.' },
    ],
  },
  outro: {
    title: '오늘 쓸 돈을 지키고,\n남은 돈은 모아요',
    lead: '텅장관리, Google Play에서 만나요.',
    links: [
      { label: '앱', url: 'Google Play · 텅장관리' },
      { label: '저장소', url: 'github.com/shinds-team7/flexable-app' },
      { label: '웹 소개', url: '/info-web' },
    ],
  },
};

export default function InfoApp() {
  return <InfoPage c={APP} variant="app" />;
}
