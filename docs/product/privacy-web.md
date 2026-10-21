# 웹 개인정보처리방침 — 근거·확인 필요·시행 절차

> 2026-10-20 결정([decisions](decisions.md) ⑤): 웹과 앱은 **같은 운영자**(ucmnuniverse)지만 계정·서버·DB가 따로라 개인정보처리방침을 **각자** 둔다. 원문은 웹 [`src/pages/Privacy.tsx`](../../src/pages/Privacy.tsx)(`/privacy`), 앱은 앱 웹 `/privacy`(flexable-app `docs/play-store/privacy-policy.md`). 지금 웹 방침은 **시행 전 초안**이다.

## 1. 원칙

- **구현 기준으로 쓴다.** 실제로 처리하는 것만, 실제 동작대로(삭제 시점 등은 코드 그대로) 적는다. 계획만 있는 기능(사용 지표 이벤트, 결제 등)은 넣지 않고 도입 전에 개정한다(사용 지표는 decisions 확정 16).
- 배포 전 항목은 배포와 같은 날 시행되게 넣는다(예: 앱 주기별 반영 기록 — 아래 4).
- 운영자·보호책임자·문의처·권리 행사·만 14세 미만·변경 고지(시행 7일 전) 문구는 앱 방침과 **같게** 유지한다.
- 같은 운영자 안의 이동이므로 앱→웹 연동은 제3자 제공이 아니라 이용자가 연동했을 때의 이용으로 적는다. 양쪽 방침의 "제3자에게 제공하지 않음" 문구는 유지한다. 법적 판단의 최종 확인은 담당자가 한다.
- **코드를 바꿔 웹이 처리하는 개인정보가 달라지면 같은 PR에서 이 문서의 표와 `Privacy.tsx`를 고친다**(AGENTS.md).

## 2. 방침 항목 ↔ 근거

| 방침 항목 | 근거(코드·테이블) |
|---|---|
| 이메일, 비밀번호(BCrypt) | `users.email`(user), `user_credentials.password_hash`(auth, `SecurityConfig` BCrypt) |
| 카카오·Google 회원 식별값, 확인된 이메일 | `user_identities`(auth). 확인되지 않은 이메일은 저장하지 않음(`RestOAuthProviderClient`·`OAuthUserService`) |
| 앱 연동 항목 | `app_links`(applink, V3): `app_email`·`app_provider`, `seed_*`, `link_id_cipher`(AES-256-GCM, `LinkIdCipher`) |
| 동의·가입 일시, 가입 방법 | `users.terms_agreed_at`·`privacy_agreed_at`·`created_at`, `user_identities.provider` |
| 화면 설정 | `user_settings`(theme·seen_tours·disclaimer_ack_at) |
| 연동 일시·마지막 조회 일시 | `app_links.created_at`·`synced_at`·`checked_at` |
| 서버 오류 기록의 회원 번호 | `AppLinkService` 경고·오류 로그의 `userId`(이메일·linkId는 남기지 않음) |
| 브라우저 저장 | `localStorage` `fx.token`(`lib/api.ts`), `fx.theme`(`lib/theme.ts`), `fx.landHint`(`pages/Landing.tsx`), `fx.news.saved`·`fx.news.filter`(`data/newsSaved.ts`), `sessionStorage` `fx.oauth.verifier`(`auth/oauth.ts`). 쿠키·분석 도구 없음 |
| 탈퇴 시 즉시 파기 | `UserService.withdraw` → `AppLinkService.removeForWithdrawal`, `AuthService.onWithdraw`, 외래 키 `ON DELETE CASCADE` |
| 연동 해제·앱 해제 확인 시 파기 | `AppLinkService.unlink`, `sync`의 `LINK_NOT_FOUND` 처리 |
| 실패 기록 메모리 10분 | `common.AttemptLimiter`(`LoginAttemptLimiter`, 연동 코드 제한) |
| 비회원 체험은 서버 저장 없음 | 로그인 전 화면은 예시 데이터만 사용(`isSample`) |

## 3. 시행 전 확인 필요(`Privacy.tsx`의 "확인 필요" 표시)

| 항목 | 누가 | 메모 |
|---|---|---|
| 웹 서버 제공 기관(처리 위탁 수탁자)과 위치 | 대표·운영 | 아카데미 VM(10-21 수령, `solpa.shinhanacademy.co.kr`). 서버·네트워크를 아카데미가 운영하면 위탁, 우리 팀은 VM 안만 관리 |
| HTTPS 적용 여부 | 운영 | 적용(앞단에서 HTTPS 종료 후 VM 80번). 앞단~VM 구간은 아카데미 내부망 HTTP |
| DB 외부 접근 차단·접근 권한 | 운영 | `deploy/vm`은 DB 포트를 열지 않고 웹 백엔드만 내부 네트워크로 접근한다. VM 접속 계정 관리는 운영이 정한다 |
| DB 백업 여부·보관 주기 | 운영 | 안: `deploy/vm/backup.sh` 매일, 7일 보관(같은 VM 안). cron 등록 뒤 확정 |
| 서버 오류 기록 보관 기간 | 운영 | `deploy/vm`은 컨테이너마다 10MB × 5개에서 회전(기간이 아니라 용량 기준). 기간으로 적으려면 회전 방식을 바꾼다 |
| Vercel 위탁 유지 여부 | 운영 | VM이 화면을 같은 출처로 서비스한다. 운영 주소를 VM으로 옮기면 Vercel 행을 뺀다 |
| 만 14세 미만 | 대표 | 앱과 같이 "가입받지 않음". 가입 화면에 연령 확인이 없는 것은 앱과 같다 |
| 이용약관 | 대표 | 아직 앱 웹 것을 쓴다(`lib/legal.ts`). 웹 전용 약관을 둘지 결정 |

## 4. 앱 쪽과 맞출 것

- 앱 방침에 "이용자가 웹 연동을 하면 웹(같은 운영자)에서 이용하는 항목·목적, 앱 설정에서 해제 가능"을 넣는다. 앱 담당 협의안(flexable-app `docs/web-seed-entries-handoff.md`)의 문구를 기준으로 하되, 항목 목록은 이 문서 2와 같게 맞춘다.
- **주기별 반영 기록·시작일(`startedOn`)**: 앱 API는 구현됐고 배포 전이다. 웹이 이를 받아 저장하는 코드가 배포되는 날 웹 방침 1항 "앱 연동"에 "주기별 반영 기록(주기 종료일·방법·금액·반영 후 합계·반영 일시), 시작일"을 더하고 같은 날 시행한다.
- 앱 HANDOFF의 "이후 유동자산 집계"는 04 §5-2 범위 밖이다. 넘기려면 04와 두 방침을 먼저 고친다.

## 5. 시행 절차

1. 3의 확인 필요 항목을 모두 채운다(`Privacy.tsx`에 "확인 필요"가 남아 있으면 시행하지 않는다).
2. 시행일을 정한다. 웹 백엔드로 가입을 받기 **전**이어야 하며, 앱 방침 개정과 같은 날로 맞추는 것을 권한다.
3. 시행 7일 전: `/privacy` 초안 안내를 "○월 ○일 시행 예정"으로 바꾸고 웹에 알린다.
4. 시행일: `lib/legal.ts`의 `WEB_PRIVACY_EFFECTIVE`에 날짜를 넣어 가입·로그인·하단 링크를 웹 방침으로 바꾼다. `APP_LINK_BASE_URL`은 이 뒤에 넣는다([HANDOFF](HANDOFF.md)).
5. 이미 앱 방침에 동의하고 웹 백엔드로 가입한 회원이 있으면, 시행일에 다시 동의를 받을지 정한다(웹 백엔드 운영 전이면 해당 없음).
