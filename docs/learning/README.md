# 코드 학습 가이드

팀 내부 학습용 웹 페이지. 웹 화면(`src/`)·웹 API(`backend/`)·웹 DB·worker·앱 연동 경계를 실제 코드로 따라간다. 제품 코드가 아니며 사이트 빌드(`npm run build`)에 들어가지 않는다.

- 기준: `origin/main` 커밋 `18d9ab1`(2026-10-28, PR #120 병합). 앱 저장소는 웹 연동(`weblink`) 부분만 `2f3d0b4` 기준
- 범위 밖: AI 목표 달성(engagement·ai 패키지, V8 표). 기획 중이라 다루지 않는다
- 서버·DB·인터넷 없이 열린다(글꼴만 Google Fonts에서 받고, 없으면 시스템 글꼴)
- 공유본: https://claude.ai/artifact/CSXDuhnQc5EqHHtv29TZ3r (링크가 있는 사람만 열림). 2026-10-28 `18d9ab1` 기준으로 다시 게시

## 열기

```bash
# 방법 1: 파일을 브라우저로 바로 연다
start docs/learning/index.html        # Windows
open docs/learning/index.html         # macOS

# 방법 2: 로컬 서버(주소 공유·새로고침이 편함)
python -m http.server 8765 --directory docs/learning
# → http://localhost:8765
```

- **학습 모드**(기본): 왼쪽 목차의 1~12단원을 순서대로 본다. 단원마다 기초 개념 → 우리 코드 → 실행 과정(요청 흐름) → 확인 질문
- **설명 모드**(상단 버튼, `#explain.1`): 멘토 설명 순서(서비스 소개 → 전체 구조 → 대표 요청 흐름 → DB 설계 → 설계 선택 → 한계·질문). 각 장의 [학습 모드에서 자세히]로 상세 내용에 들어간다
- `/` 키로 검색, 요청 흐름과 설명 모드는 ← → 키로 넘긴다
- 코드 링크는 GitHub의 기준 커밋 줄로 열리고, [복사]는 `파일:줄`을 복사한다(IDE에서 Ctrl+P로 붙여 찾기)
- 단원 완료 체크는 이 브라우저(localStorage)에만 남는다

## 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 틀·스타일 |
| `app.js` | 화면 그리기·이동·검색 |
| `content/meta.js` | 기준 커밋, 근거 표시 종류, 레이어, 구조 지도, 기능별 구현 상태 |
| `content/units.js` | 학습 단원(추천 순서), 단원별 확인 질문 |
| `content/flows.js` | 기능별 요청 흐름(단계마다 위치·파일·입출력·DB 읽기/쓰기) |
| `content/code.js` | 핵심 코드 카드, 백엔드 패키지 표 |
| `content/db.js` | 테이블 사전, ERD 좌표, JOIN 예제 |
| `content/concepts.js` | 개념 사전 |
| `content/design.js` | 설계 선택·한계·멘토 질문, 설명 모드 순서 |
| `check-refs.mjs` | 코드 위치 검사·줄 번호 갱신 |

근거 표시: **코드**(코드·설정·마이그레이션에 있음) · **테스트**(테스트가 검사, 기준 커밋에서 `./gradlew test --rerun` 235개 통과 확인) · **추론**(코드에서 읽어 낸 의도) · **운영 미확인**(운영 반영 상태는 저장소로 알 수 없음) · **계획만**(README·문서에만 있음). 예시 행은 스키마에 맞춘 가상 값이다.

## 코드가 바뀌었을 때

내용 파일의 코드 위치는 `R("파일 경로", "찾을 글자", 줄)` 형식이다. 줄 번호는 손으로 고치지 않는다.

```bash
node docs/learning/check-refs.mjs          # 찾을 글자로 줄 번호를 다시 찾아 써 넣는다
node docs/learning/check-refs.mjs --check  # 바뀔 것이 있거나 못 찾은 위치가 있으면 실패
# 앱 저장소 위치: FLEXABLE_APP=../flexable-app (기본은 ../flexable-app, ../../flexable-app 순서로 찾음)
```

못 찾은 위치가 나오면 코드가 바뀐 것이므로 그 단계·설명을 새 코드에 맞게 고친다. 기준 커밋을 옮기면 `content/meta.js`의 `commit`·`commitShort`도 바꾼다.

## 공유본 다시 게시하기

공유본은 이 폴더의 `index.html`·`app.js`·`content/*.js`를 그대로 올린 것이다(`README.md`·`check-refs.mjs`는 올리지 않는다).

1. 최신 `main`에서 `node docs/learning/check-refs.mjs`로 줄 번호를 맞추고, 못 찾은 위치가 있으면 내용을 고친다.
2. 기준 커밋·테스트 수(`content/meta.js`의 `commit`·`commitShort`·`tests`)와 이 README의 기준 줄을 바꾼다.
3. 브라우저로 `index.html`을 열어 바뀐 단원·흐름을 확인한 뒤, 위 공유본 주소에 다시 게시한다(주소를 유지해야 팀원 링크가 그대로 산다).
