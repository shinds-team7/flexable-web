# API 계약(OpenAPI)

| 파일 | 무엇 | 검사 |
|---|---|---|
| [`web-api.yaml`](web-api.yaml) | 브라우저(웹 프론트) ↔ 웹 백엔드 `/api/v1` | 백엔드 `contract.ContractTest`(실제 응답의 상태 코드·필드, 목 서버 `example`), CI `npm run check:api`(프론트 타입이 최신인지), `npm run typecheck`의 `src/lib/contractChecks.ts`(화면 타입이 계약과 맞는지) |

웹 백엔드(`applink.AppApiClient`)가 부르는 앱 서버 `/internal/v1/web-links/*`는 앱 저장소의 [`docs/contracts/web-link-api.yaml`](https://github.com/shinds-team7/flexable-app/blob/main/docs/contracts/web-link-api.yaml)이 정본이다. 앱이 이 스펙을 바꾸면(`spec-change`) 웹 `applink/http/RestAppApiClient`의 요청·응답 record와 맞는지 확인한다.

## 쓰는 법

- **프론트 타입**: `npm run gen:api` → `src/lib/api-schema.d.ts`(직접 고치지 않음). 사용 예: `import type { components } from '@/lib/api-schema'; type SeedMoney = components['schemas']['SeedMoneyResponse'];`
- **화면 타입 대조**: `src/data/*.ts`의 화면 타입은 판별 유니언·설명 때문에 손으로 쓴 것을 쓰고, [`src/lib/contractChecks.ts`](../../src/lib/contractChecks.ts)가 생성 타입과 대조한다. 계약이 바뀌어 필드 이름·종류·null 여부가 어긋나면 `npm run typecheck`가 실패한다. 새 API를 화면에 붙이면 거기에 한 줄을 더한다
- **목 서버(백엔드 없이 화면 개발)**: 터미널 하나에서 `npm run mock:api`(Prism, 4010), 다른 터미널에서 `npm run dev:mock`. 응답은 스펙의 `example`이 있으면 그 값, 없으면 형식에 맞는 임의 값이다. 지금 `example`이 있는 응답: 시드머니(`/me/seed-money`·PUT manual), 종목 목록, 적금 목록, 청년 소식. `ContractTest.목_서버_예시`가 example도 스펙으로 검사한다
- **백엔드 계약 테스트**: `cd backend && ./gradlew test --tests "*ContractTest"`(CI의 `./gradlew build`에 포함). 스펙에 없는 필드·상태 코드가 응답에 나오면 실패한다.

## 바꾸는 순서

1. 이 파일을 먼저 고치는 PR을 올린다(`spec-change` 라벨 + `docs/CHANGELOG.md` 한 줄, CODEOWNERS 리뷰). 같은 PR에서 `npm run gen:api` 결과도 커밋한다.
2. 백엔드는 `ContractTest`가 통과하도록 구현하고, 프론트는 새 타입·목 서버로 동시에 작업한다.
3. 응답 형식은 OpenAPI 3.0.3으로 쓴다. 비어 있을 수 있는 값은 `nullable: true`, 응답 객체는 `additionalProperties: false`로 적는다.
