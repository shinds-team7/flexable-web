# 금융 가이드 콘텐츠 작성 규칙

금융 가이드 상세(`/guide/:category/:id`)에 들어가는 금융지식 콘텐츠의 공통 규칙이다. 원고를 쓰거나 고치기 전에 이 문서를 먼저 읽는다.

> **현재 구현(2026-11-04)**
> - 원고(콘텐츠 데이터): `src/data/guideArticles.ts`의 `GUIDE_ARTICLES`. 키는 `src/data/financeGuide.ts`의 `GUIDE_CONTENTS` 카드 `id`다.
> - 화면(템플릿): `src/pages/FinanceGuideDetail.tsx` 하나. 본문 최대 너비는 760px다. 표지는 `public/guide/{slug}.png` 이미지 파일(2:1, 원본 1774×887, 화면에서 최대 760×380)이고, 화면 읽기용 설명은 `docs/content-reviews/cover-alt-text.json`에 있다(원고 `cover.alt`에 옮겨 적는다). 모바일(767px 이하)에서는 표지가 화면 가로 끝까지 찬다.
> - 별도 `slug` 필드는 없다. 카드 `id`가 주소(`/guide/:category/:id`)와 원고 키를 겸한다. 이 문서의 `{slug}`는 이 `id`를 뜻한다.
> - 원고마다 `status: 'draft' | 'published'`가 있다. draft는 `npm run dev`에서만 보이고 운영 화면에서는 '준비 중'이다(§7).
> - 작성된 원고: `interest-rate`('금리와 기준금리', published 2026-11-04 승인), `interest-income-tax`('이자소득세', published 2026-11-04 승인), `simple-vs-compound`('단리 vs 복리', published 2026-11-04 승인), `inflation-real-rate`('인플레이션과 실질금리', published 2026-11-04 승인), `exchange-rate`('환율', published 2026-11-04 승인), `gross-vs-net-pay`('세전 월급 vs 실수령액', published 2026-11-04 승인), `year-end-tax`('연말정산', published 2026-11-04 승인), `credit-score`('신용점수', published 2026-11-04 승인), `loan-rate-repayment`('대출 금리와 상환 방식', published 2026-11-04 승인), `saving-vs-investing`('저축 vs 투자', published 2026-11-04 승인), `deposit-vs-savings`('예금 vs 적금', published 2026-11-04 승인), `parking-vs-cma`('파킹통장 vs CMA', published 2026-11-04 승인), `stock-basics`('주식 기초', published 2026-11-04 승인), `kospi-vs-kosdaq`('코스피 vs 코스닥', published 2026-11-04 승인), `bond-basics`('채권 기초', published 2026-11-04 승인), `fund-vs-etf`('펀드 vs ETF', published 2026-11-04 승인), `isa-vs-pension`('ISA vs 연금저축', published 2026-11-04 승인), `housing-subscription`('청약통장', published 2026-11-04 승인). 검증 보고서는 `docs/content-reviews/{slug}.md`.
> - 카드 목록(`GUIDE_CONTENTS`)은 §2 목록과 같다. 카드 제목은 §2의 주제다. 카드 설명(`desc`)과 읽는 시간(`minutes`)은 원고를 쓸 때 원고에 맞게 채운다(2026-11-04 기준 18편 모두 채움).

## 1. 대상

금융을 처음 공부하는 청년과 사회초년생.

## 2. 콘텐츠 목록

| 카테고리 | slug | 주제 |
|---|---|---|
| 금융 기초 | `interest-rate` | 금리와 기준금리 |
| 금융 기초 | `interest-income-tax` | 이자소득세 |
| 금융 기초 | `simple-vs-compound` | 단리 vs 복리 |
| 금융 기초 | `inflation-real-rate` | 인플레이션과 실질금리 |
| 금융 기초 | `exchange-rate` | 환율 |
| 금융 기초 | `gross-vs-net-pay` | 세전 월급 vs 실수령액 |
| 금융 기초 | `year-end-tax` | 연말정산 |
| 금융 기초 | `credit-score` | 신용점수 |
| 금융 기초 | `loan-rate-repayment` | 대출 금리와 상환 방식 |
| 저축과 투자 | `saving-vs-investing` | 저축 vs 투자 |
| 저축과 투자 | `deposit-vs-savings` | 예금 vs 적금 |
| 저축과 투자 | `parking-vs-cma` | 파킹통장 vs CMA |
| 저축과 투자 | `housing-subscription` | 청약통장 |
| 저축과 투자 | `stock-basics` | 주식 기초 |
| 저축과 투자 | `kospi-vs-kosdaq` | 코스피 vs 코스닥 |
| 저축과 투자 | `bond-basics` | 채권 기초 |
| 저축과 투자 | `fund-vs-etf` | 펀드 vs ETF |
| 저축과 투자 | `isa-vs-pension` | ISA vs 연금저축 |

'저축과 투자'의 카테고리 `id`(주소)는 `product`다(`/guide/product`).

따로 글을 두지 않고 다른 글 안에서 다루는 주제:

| 주제 | 다루는 글 |
|---|---|
| 비상금 | `saving-vs-investing`(저축 vs 투자), `parking-vs-cma`(파킹통장 vs CMA) |
| 예금자보호 · 우대금리 · 중도해지 | `deposit-vs-savings`(예금 vs 적금) |

## 3. 정확성 규칙

1. 모든 사실, 수치, 제도 설명은 작성일에 직접 읽은 자료로 확인한다.
2. 기억이나 추측으로 쓰지 않는다. 확인하지 못한 내용은 원고에서 빼고 보고서에 남긴다.
3. 공공기관, 법령, 시장 운영기관의 자료를 우선한다.
   한국은행, 금융감독원, 금융위원회, 예금보험공사, 국세청, 국가법령정보센터, 국민건강보험공단, 국민연금공단, 근로복지공단, 청약홈, 국토교통부, 한국거래소, 금융투자협회
4. 공식 자료가 없을 때만 주제에 맞는 신용평가사나 주요 언론 자료를 사용하고, 보고서에 그 이유를 적는다.
5. 블로그, 카페, 출처 없는 요약 글, 다른 AI의 답변은 근거로 쓰지 않는다.
6. 세율, 한도, 공제액, 기준금리처럼 바뀔 수 있는 값에는 기준일을 적는다.
7. 자료가 서로 다르면 임의로 고르지 말고 보고서에 차이를 적는다.
8. 페이지가 열리지 않거나 본문을 읽지 못하면 내용을 짐작하지 말고 요청자에게 알린다.
9. 계산이 들어간 예시는 코드로 실행해 결과를 확인한다.
10. 예시로 정한 금액과 금리는 원고에 예시라고 표시한다. 계산식(`calc`)은 캡션(`caption`)마다 '예시'를 적는다(예: "예시 · 단리 기준, 세금 떼기 전"). 푸터 안내만으로 대신하지 않는다.
11. 특정 종목, 상품, 금융회사를 추천하지 않는다. 투자 글에는 원금 손실 가능성을 적는다.
12. 기준금리·환율·주가처럼 자주 바뀌는 현재 수치는 원고에 넣지 않고, 확인할 수 있는 공식 페이지로 안내한다(푸터 출처에 링크).
13. 세율, 한도처럼 글의 핵심이라 꼭 필요한 수치만 기준일과 함께 적는다.
14. 예시 숫자는 실제 현재 수치처럼 보이지 않게 '예시'로 표시한다.

기존 규칙(코드 주석)에서 이어지는 것:

- 특정 상품 추천·수익 보장·가입 유도는 하지 않는다. 일반적인 상품 구조만 설명한다.
- 금액 예시는 고정 문구로 적고 화면에서 계산하지 않는다(ADR-3: 금액·수익률·이자 계산은 서버가 한다). 검산은 규칙 9대로 작성할 때 코드로 한다.
- 사람이 준 원고를 옮길 때는 문구·숫자를 고치지 않는다. 고칠 곳이 보이면 고치지 말고 알린다.

## 4. 글 형식

- 친절한 해요체로 쓰되 어린이 대상처럼 쓰지 않는다.
- 핵심만 담아 짧게 쓴다. 섹션 개수는 정해 두지 않되, 글이 너무 길어지지 않게 꼭 필요한 섹션만 둔다. FAQ 질문은 0~2개다(0개면 FAQ 섹션을 두지 않는다).
- 용어 모음 섹션: 독자가 자주 마주치는 용어를 모아 두면 정말 도움이 되는 글에만 넣는다. 제목은 '🧭 자주 보는 ○○ 용어', 내용은 `terms` 블록 하나이고 FAQ 바로 앞에 둔다. 모든 글에 넣지 않는다.
- FAQ 질문·답 앞에 'Q.'·'A.'를 쓰지 않는다. 질문 앞 번호(1️⃣ 2️⃣)는 화면이 붙이고, 답 앞 표시는 `mark`로 정한다: '아니요'로 시작하는 답은 `no`(❌), '네'로 시작하는 답은 `yes`(✅), 그 밖의 설명형 답은 비워 두면 💡.
- 기존 데이터 형식(§5, TypeScript 객체)을 유지하고, 화면 코드는 수정하지 않는다.
- 현재 형식으로 표현할 수 없는 내용이 있으면 먼저 알린다. 블록 종류를 더할지는 그다음에 정한다.
- 원고마다 검증 보고서를 만든다(§6).
- 사람이 승인하기 전의 글은 draft로 두고 공개하지 않는다(§7).

## 5. 화면 구조와 데이터 형식

원고는 `src/data/guideArticles.ts`에 TypeScript 객체로 적는다(JSON 파일이 아니다). 원고 하나를 상수로 만들고, status에 따라 `DRAFT_ARTICLES` 또는 `PUBLISHED_ARTICLES`에 `slug` 키로 넣는다. 화면은 둘을 합친 `GUIDE_ARTICLES`를 읽는다. 타입은 같은 파일의 `GuideArticle`·`GuideSection`·`GuideBlock`이다.

**화면 순서(템플릿 공통)**: 경로 표시 → 표지(2:1, 선택) → 제목 영역(분류명·제목·해시태그) → 섹션(H2 + 블록) 반복 → 푸터(안내 문구·출처 링크, 새 탭).

| 필드 | 내용 |
|---|---|
| `status` | `'draft'`(승인 전) 또는 `'published'`(승인 후). 필수 |
| `title` | 상세 제목. 없으면 카드 제목을 쓴다 |
| `hashtags` | 제목 아래 해시태그 줄(문자열 그대로). 없으면 `#카드 태그` |
| `cover` | 이미지 파일: `{ src, alt }`. `src`는 `/guide/{slug}.png`(2:1), `alt`는 `docs/content-reviews/cover-alt-text.json`의 설명. |
| `sections` | `{ title, blocks }[]`. `title`이 H2 |
| `footer` | `{ notes: string[], sources: { label, url }[] }` |

**블록 종류**

| `type` | 쓰는 곳 | 필드 |
|---|---|---|
| `p` | 문단. `**굵게**`는 굵은 글자로 보인다 | `text` |
| `calc` | 계산식 박스. 칸은 라벨 위·값 아래, 칸 사이 연산자, 마지막 칸이 결과(강조색), 아래 캡션 | `terms: { label, value }[]`, `ops: string[]`(`ops[i]`는 `terms[i]`와 `terms[i+1]` 사이), `caption` |
| `terms` | 용어 목록(왼쪽 용어·오른쪽 설명). 설명에 `**굵게**` 가능 | `items: { term, desc }[]` |
| `faq` | 자주 묻는 질문(답은 늘 펼침). 질문 앞 번호는 화면이 붙임. 답에 `**굵게**` 가능 | `items: { q, a, mark? }[]`(`mark`: `'yes'` ✅ · `'no'` ❌ · `'tip'` 💡, 기본값 `'tip'`) |

- 원고가 없는 카드는 상세에서 '준비 중'으로 보인다.
- 계산식은 좁은 화면(380px)에서도 한 줄로 보여야 하므로 칸 3개 안팎, 값은 짧게 쓴다.
- 디자인(색·모서리·글자 크기)은 템플릿과 `src/styles/finance-guide.css`가 정한다. 색·모서리는 `src/styles/tokens.css` 토큰만 쓴다.

## 6. 검증 보고서

- 위치: `docs/content-reviews/{slug}.md`
- 원고 하나에 보고서 하나. 원고에 들어간 사실·수치·제도 설명마다 한 행을 둔다.

| 문장 또는 수치 | 근거 URL | 기관 | 자료 기준일 | 확인일 | 확인 결과 |
|---|---|---|---|---|---|

- 표 아래에 적는 것: 확인하지 못해 원고에서 뺀 내용(규칙 2), 공식 자료 대신 다른 자료를 쓴 이유(규칙 4), 자료끼리 다른 점(규칙 7), 열리지 않은 페이지(규칙 8), 계산 예시를 실행한 코드와 결과(규칙 9).

## 7. 승인과 공개

- 새 원고와 다시 쓴 원고는 `status: 'draft'`로 `DRAFT_ARTICLES`에 넣는다. 사람이 승인하면 `status: 'published'`로 바꾸고 `PUBLISHED_ARTICLES`로 옮긴다. 상태와 넣은 곳이 다르면 `npm run typecheck`가 실패한다.
- draft 본문은 `npm run dev`(개발 화면)에서만 보이고, 위에 "승인 전(draft)" 안내 띠가 붙는다. 운영 화면에서는 '준비 중'으로 보인다.
- 운영 빌드(`npm run build`)에서는 `import.meta.env.DEV`가 false여서 `DRAFT_ARTICLES`와 그 원고가 번들에서 빠진다.
- 한계:
  - 번들에서 빠지는 것은 원고 데이터뿐이다. 표지 이미지(`public/guide/`)와 카드(제목·태그)는 draft여도 운영 빌드와 화면에 들어간다.
  - 운영 모드로 빌드하는 PR 미리보기 배포에서도 draft는 '준비 중'으로 보인다. draft 검토는 로컬 `npm run dev`에서 한다.
  - draft도 저장소에는 커밋되고, 공개 저장소라 누구나 원고를 읽을 수 있다.
