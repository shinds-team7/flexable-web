// 기준 정보, 실행 위치(레이어), 전체 구조 지도, 기능별 구현 상태.
G.meta = {
  repo: 'shinds-team7/flexable-web',
  gh: 'https://github.com/shinds-team7/flexable-web',
  commit: '8464b60efa17f7c53ef041ec901426b3bbf8b89a',
  commitShort: '8464b60',
  commitTitle: 'Merge pull request #77 (2026-10-25 16:09 KST)',
  appGh: 'https://github.com/shinds-team7/flexable-app',
  appCommit: '4b7b2e8',
  analyzedOn: '2026-10-25',
  tests: '2026-10-25 이 커밋에서 ./gradlew test 실행: 178개 통과, 실패 0 (계약·정책 테스트 포함, H2 메모리 DB, 외부 서비스는 가짜 서버로 대신)',
};

// 근거 표시 종류
G.evidence = {
  code: { label: '코드', desc: '이 커밋의 코드·설정·마이그레이션에 있다.' },
  test: { label: '테스트', desc: '테스트가 이 동작을 검사한다(이번에 실행해 통과 확인).' },
  infer: { label: '추론', desc: '코드에서 읽어 낸 설계 의도다. 코드나 주석에 이유가 직접 적혀 있지는 않다.' },
  ops: { label: '운영 미확인', desc: '실제 운영 서버에 어떻게 반영돼 있는지는 저장소만으로 알 수 없다.' },
  plan: { label: '계획만', desc: '문서·README에만 있고 코드는 없다.' },
};

// 코드가 실행되는 곳
G.layers = {
  browser: { name: '브라우저', short: '브라우저', desc: '사용자 컴퓨터의 브라우저. React 화면 코드(src/)가 여기서 돈다.' },
  proxy: { name: '정적 서버·프록시', short: '프록시', desc: '빌드한 화면 파일을 내려 주고 /api 요청을 웹 API로 넘긴다. VM은 nginx, 로컬은 Vite 개발 서버.' },
  api: { name: '웹 API 서버', short: '웹 API', desc: 'backend/의 Spring Boot 프로세스(기본 프로필). HTTP 요청을 받아 처리한다.' },
  db: { name: '웹 DB', short: '웹 DB', desc: '웹 전용 MySQL(로컬은 H2 파일). 앱 DB와 따로다.' },
  app: { name: '앱 서버', short: '앱 서버', desc: '다른 저장소(flexable-app)의 서버. 웹은 /internal/v1/web-links로만 부른다.' },
  ext: { name: '외부 서비스', short: '외부', desc: '카카오·Google 로그인, 키움·KRX 시세, OpenDART 공시.' },
  worker: { name: 'worker', short: 'worker', desc: '같은 backend jar를 worker 프로필로 띄운 프로세스. HTTP를 열지 않고 수집만 한다.' },
};

// 전체 구조 지도(SVG 좌표는 viewBox 1000×560 기준)
G.map = {
  nodes: [
    { id: 'browser', layer: 'browser', x: 380, y: 18, w: 240, h: 64, name: '사용자 브라우저', sub: 'React SPA · src/',
      runs: '빌드된 JS가 브라우저에서 실행된다. 화면 이동(React Router)은 서버에 묻지 않고 브라우저 안에서 한다. 데이터가 필요할 때만 fetch로 /api/v1/...을 부른다.',
      where: ['src/main.tsx가 시작점', 'src/App.tsx가 주소 → 화면 표', 'src/lib/api.ts가 모든 API 요청의 입구'],
      refs: [R("src/main.tsx", "createRoot(", 13), R("src/App.tsx", "createBrowserRouter([", 19), R("src/lib/api.ts", "export async function api<T>", 48)], ev: ['code'] },
    { id: 'vercel', layer: 'proxy', x: 40, y: 150, w: 250, h: 64, name: 'Vercel (정적 파일)', sub: 'main 머지 시 자동 배포',
      runs: '빌드 결과(dist/)만 내려 준다. 서버 코드는 없다. 빌드할 때 VITE_API_URL이 앱 서버를 가리키게 설정돼 있어서, 이 배포본의 로그인은 앱 계정으로 되고 웹 백엔드 API(시세·시뮬레이션·앱 연동)는 없다(README 기재).',
      where: ['vercel.json: 설치·빌드 명령, /m과 나머지 주소를 index.html로 rewrite', 'VITE_API_URL 값은 Vercel 프로젝트 설정에 있어 저장소로는 확인할 수 없다'],
      refs: [R("vercel.json", "rewrites", 6), R(".env.example", "VITE_API_URL=", 2), R("src/lib/legal.ts", "export const usesWebBackend", 22)], ev: ['code', 'ops'] },
    { id: 'nginx', layer: 'proxy', x: 380, y: 150, w: 240, h: 64, name: 'VM nginx (web 컨테이너)', sub: '정적 파일 + /api/ 프록시',
      runs: 'solpa VM의 web 컨테이너. 빌드한 화면 파일을 주고, /api/로 시작하는 요청만 api 컨테이너 8080으로 넘긴다. 화면과 API가 같은 주소(출처)라 CORS가 필요 없다.',
      where: ['deploy/vm/web.Dockerfile: VITE_API_URL을 비우고 빌드', 'deploy/vm/nginx.conf: location /api/ → proxy_pass http://api:8080'],
      refs: [R("deploy/vm/nginx.conf", "location /api/ {", 20), R("deploy/vm/web.Dockerfile", "ENV VITE_API_URL=", 9), R("vite.config.ts", "proxy:", 12)], ev: ['code', 'ops'] },
    { id: 'social', layer: 'ext', x: 720, y: 150, w: 250, h: 64, name: '카카오 · Google', sub: '소셜 로그인 공급자',
      runs: '브라우저는 로그인 화면으로 이동하고, 웹 API는 받은 code로 토큰·프로필을 요청한다. client-id가 비어 있으면 그 공급자는 꺼진다.',
      where: ['auth/OAuthService: 공급자 로그인 주소 만들기', 'auth/RestOAuthProviderClient: 토큰·프로필 요청'],
      refs: [R("backend/src/main/java/com/flexable/web/auth/OAuthService.java", "public String start(String provider", 39), R("backend/src/main/java/com/flexable/web/auth/RestOAuthProviderClient.java", "kauth.kakao.com/oauth/token", 35)], ev: ['code'] },
    { id: 'appserver', layer: 'app', x: 40, y: 300, w: 250, h: 72, name: '앱 서버 (flexable-app)', sub: '앱 계정 · 앱 DB · /internal/v1',
      runs: '다른 저장소의 서버. 웹 API는 [앱 연동하기]에서만 서비스 키(X-Service-Key)를 붙여 /internal/v1/web-links/*를 부른다. 웹과 앱은 DB를 공유하지 않는다.',
      where: ['웹 쪽 호출: applink/http/RestAppApiClient', '앱 쪽 받는 곳: flexable-app weblink/InternalWebLinkController'],
      refs: [R("backend/src/main/java/com/flexable/web/applink/http/RestAppApiClient.java", "public CreatedLink create(String code)", 59), R("app:backend/src/main/java/com/flexable/api/weblink/InternalWebLinkController.java", "LinkCreated link(@Valid", 33)], ev: ['code'] },
    { id: 'api', layer: 'api', x: 380, y: 300, w: 240, h: 72, name: '웹 API (Spring Boot)', sub: 'backend/ · :8080 · 기본 프로필',
      runs: 'Java 21 + Spring Boot 4. 내장 웹 서버(톰캣)가 HTTP를 받고, 보안 필터 → 컨트롤러 → 서비스 → 리포지토리 순으로 처리한다. 시세는 읽기만 하고 외부 시세 API는 부르지 않는다.',
      where: ['WebApplication.main이 시작점', 'config/SecurityConfig: 어떤 주소에 로그인이 필요한지', 'application.yml: DB 주소·풀 크기·키 이름'],
      refs: [R("backend/src/main/java/com/flexable/web/WebApplication.java", "SpringApplication.run", 12), R("backend/src/main/java/com/flexable/web/config/SecurityConfig.java", "SecurityFilterChain filterChain(", 33), R("backend/src/main/resources/application.yml", "maximum-pool-size", 13)], ev: ['code'] },
    { id: 'worker', layer: 'worker', x: 720, y: 300, w: 250, h: 72, name: 'worker (같은 jar)', sub: 'SPRING_PROFILES_ACTIVE=worker',
      runs: 'HTTP를 열지 않는 수집 전용 프로세스. 켜질 때 한 번, 그 뒤 평일 18:30(한국 시간)에 종목 목록·일봉을 받아 DB에 쓰고, 이어서 급변동 사건을 찾고 공시 근거를 붙인다.',
      where: ['application-worker.yml: web-application-type none', 'ingest/MarketSyncJob · MarketEventJob', 'docker-compose.yml의 worker 서비스(profiles: worker)'],
      refs: [R("backend/src/main/resources/application-worker.yml", "web-application-type: none", 4), R("backend/src/main/java/com/flexable/web/ingest/MarketSyncJob.java", "public synchronized Result runOnce()", 78), R("deploy/vm/docker-compose.yml", "SPRING_PROFILES_ACTIVE: worker", 66)], ev: ['code', 'ops'] },
    { id: 'db', layer: 'db', x: 380, y: 452, w: 240, h: 64, name: '웹 DB (MySQL 8.4)', sub: '로컬·테스트는 H2',
      runs: '웹 전용 DB. 표 구조는 Flyway 마이그레이션(V1~V9)이 만들고, 앱이 켜질 때 Hibernate가 엔티티와 표가 맞는지 검사한다(ddl-auto: validate). VM에서는 포트를 열지 않아 api·worker만 접근한다.',
      where: ['db/migration/V*.sql', 'docker-compose.yml의 db 서비스'],
      refs: [R("backend/src/main/resources/db/migration/V1__web_accounts.sql", "CREATE TABLE users", 4), R("backend/src/main/resources/application.yml", "ddl-auto: validate", 17), R("deploy/vm/docker-compose.yml", "image: mysql:8.4", 25)], ev: ['code'] },
    { id: 'datasrc', layer: 'ext', x: 720, y: 452, w: 250, h: 64, name: '키움 · KRX · OpenDART', sub: '시세 · 종목 목록 · 공시',
      runs: 'worker만 부른다. 키가 비어 있으면 해당 단계만 실패하거나 건너뛴다. 테스트는 가짜 소스(fake)와 가짜 HTTP 서버로 대신한다.',
      where: ['ingest/IngestConfig: 어떤 소스를 쓸지 고르는 switch'],
      refs: [R("backend/src/main/java/com/flexable/web/ingest/IngestConfig.java", "PriceSource priceSource(", 59)], ev: ['code', 'test'] },
  ],
  edges: [
    { from: [500, 82], to: [500, 150], label: '화면 파일 + /api/v1 (HTTPS)', lx: 508, ly: 122 },
    { from: [430, 82], to: [200, 150], label: '화면 파일', lx: 250, ly: 108 },
    { from: [400, 82], to: [120, 300], label: 'Vercel 배포본만: VITE_API_URL로 앱 서버 호출', lx: 60, ly: 280, dash: true, path: 'M400 82 C 20 100, 20 220, 110 300' },
    { from: [600, 82], to: [800, 150], label: '로그인 화면 이동', lx: 690, ly: 108, dash: true },
    { from: [500, 214], to: [500, 300], label: 'proxy_pass :8080', lx: 508, ly: 262 },
    { from: [380, 336], to: [290, 336], label: '/internal/v1 + 서비스 키', lx: 292, ly: 328 },
    { from: [620, 310], to: [760, 214], label: 'code → 토큰·프로필', lx: 668, ly: 250 },
    { from: [500, 372], to: [500, 452], label: 'JDBC (커넥션 풀 10)', lx: 508, ly: 418 },
    { from: [760, 372], to: [620, 470], label: 'JDBC (풀 3)', lx: 664, ly: 412 },
    { from: [845, 372], to: [845, 452], label: 'HTTPS', lx: 852, ly: 418 },
  ],
};

// 기능별 구현 상태(서비스 소개 슬라이드·시작 화면에서 함께 쓴다)
G.status = [
  { f: '웹 계정 (이메일 가입·로그인, 카카오·Google)', s: 'done', where: 'auth · user 패키지, /login /signup /oauth/callback', ev: ['code', 'test'], test: 'AuthFlowTest, OAuthFlowTest' },
  { f: '웹 설정 (테마·본 안내·고지 확인)', s: 'done', where: 'user 패키지, GET·PATCH /me/settings', ev: ['code', 'test'], test: 'UserSettingsTest' },
  { f: '앱 연동하기 (코드 입력 → 앱 시드머니 받아 오기)', s: 'done', where: 'applink 패키지, /me 화면', ev: ['code', 'test'], test: 'AppLinkFlowTest, RestAppApiClientTest' },
  { f: '시드머니 보기·직접 고치기', s: 'done', where: 'seedmoney 패키지, /home', ev: ['code', 'test'], test: 'SeedMoneyManualApiTest' },
  { f: '투자 시뮬레이션 (종목 목록·계산·사건 핀)', s: 'done', where: 'market · simulation 패키지, /invest', ev: ['code', 'test'], test: 'SimulationApiTest, SimulationEngineTest, EventApiTest' },
  { f: '시세·사건 수집 (worker)', s: 'done', where: 'ingest 패키지', ev: ['code', 'test'], test: 'MarketSyncJobTest, MarketEventJobTest (가짜 소스)' },
  { f: '적금 모아보기', s: 'sample', where: '화면만. 결과는 src/data/savings.ts 고정 예시, 서버 패키지는 README만', ev: ['code', 'plan'] },
  { f: '청년 금융 소식', s: 'sample', where: '화면만. 예시 데이터 + 챙기기는 브라우저 localStorage', ev: ['code', 'plan'] },
  { f: '플러스·결제', s: 'sample', where: '모의 결제 화면만. 저장·서버 호출 없음 (billing은 README만)', ev: ['code', 'plan'] },
  { f: '홈의 코스피/코스닥 지수·소식·"굴렸다면"', s: 'sample', where: 'src/data/home.ts의 예시 값 (isSample)', ev: ['code'] },
  { f: '사건 설명(LLM) 검수', s: 'plan', where: 'insight 패키지 README만. 지금 설명은 숫자로 만든 사실 문장', ev: ['plan'] },
  { f: 'AI 목표 달성 (/goal)', s: 'out', where: '코드(engagement·ai 패키지, V8 표)는 있지만 기획 중이라 이 가이드에서 다루지 않음', ev: ['code'] },
  { f: '앱 시연 (/m, mobile-demo)', s: 'demo', where: 'Expo 웹 빌드, 예시 데이터만. 서버를 부르지 않는다', ev: ['code'] },
];
