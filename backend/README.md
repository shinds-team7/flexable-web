# 웹 백엔드 (flexable-web/backend)

> **구조만 정한 상태다. 코드·빌드 파일은 아직 없다.** 2026-10-20 사용자 결정: 웹은 앱(project2)과 서버·DB·계정을 따로 운영하고, 사용자가 원할 때만 [앱 연동하기]로 앱 정보를 받아 온다. 경계와 연동 계약은 [`docs/product/04-service-boundaries.md`](../docs/product/04-service-boundaries.md)가 정본이다.

## 왜 분리하나

- 웹은 앱과 별개로 **아카데미 내부 폐쇄망**에 띄운다(사양은 주최 측이 맞춰 줌).
- 웹 부하(시세 수집·시뮬레이션)가 앱 API에 영향을 주면 안 되고, 배포도 독립적이어야 한다.
- 앱을 쓰지 않는 사람도 웹만 가입해서 쓸 수 있어야 한다.

## 전체 그림

```text
브라우저 ──▶ 웹(Vite 정적 파일) + /api ──▶ 웹 백엔드(이 폴더, Spring) ──▶ 웹 DB(MySQL)
                                                 │
                                                 └─ applink ──▶ project2 /internal/v1/web-links (연동한 사용자만)
```

- 브라우저는 **웹 백엔드만** 호출한다. project2 API를 브라우저가 직접 부르지 않는다.
- project2와 통신하는 코드는 `applink` 패키지 **한 곳에만** 둔다. 다른 패키지는 `applink`가 공개한 인터페이스·DTO만 쓴다.
- 웹 계정은 웹 DB에 따로 둔다. 앱 계정과는 연동 레코드(`linkId`)로만 이어지고, 앱 테이블을 복제하지 않는다.

## 스택

project2 `backend/`와 맞춘다: Spring Boot 4 · Java 21 · Gradle · MySQL · Flyway. 패키지 `com.flexable.web`. 기능 하나 = 패키지 하나, 안에서는 `XxxController`·`XxxService`·`XxxRepository`·엔티티를 평평하게 둔다(project2와 같은 방식).

## 패키지

| 패키지 | 책임 | 의존해도 되는 곳 |
|---|---|---|
| `config` | 보안·CORS·프로필(api/worker)·시계 설정 | 전부 |
| `common` | 오류 응답 형식, 금액·날짜 공통 타입 | 없음 |
| `applink` | [앱 연동하기]와 project2 호출의 유일한 출입구 | `common` |
| `auth` | 웹 가입·로그인·세션 발급·폐기(웹 계정, 자체 비밀키) | `member` |
| `member` | 웹 회원 정보·설정·동의, 탈퇴 조정 | `applink` |
| `seedmoney` | 앱 유동자산 집계를 받아 웹에서 쓰는 시드머니 | `applink`, `member` |
| `market` | 종목·일별 시세·사건 | `common` |
| `insight` | 사건 설명(사전 생성·검수 상태) | `market` |
| `savings` | 적금 상품·금리 | `common` |
| `simulation` | 투자·적금 계산 엔진, 프리셋 | `market`, `savings`, `seedmoney` |
| `news` | 청년 금융 소식 | `common` |
| `billing` | 요금제·구독·결제 | `member` |
| `engagement` | 목표·공유·지표 이벤트 | `simulation`, `member` |
| `ingest` | 외부 데이터 수집 작업 공통(worker 프로필에서만 동작) | 각 도메인의 저장 인터페이스 |

규칙: 표에 없는 방향의 import는 금지하고 `src/test/.../architecture`의 테스트로 막는다. 다른 패키지의 Repository·엔티티를 직접 쓰지 않는다.

## API 경로

웹 백엔드는 자기 서버이므로 `/api/v1/...`를 그대로 쓴다(`/web` 접두어 없음). 금액·수익률 계산은 서버가 하고 원 단위 정수, 나눗셈은 내림.

## 아직 정해지지 않은 것

경계 문서 §10을 본다.
