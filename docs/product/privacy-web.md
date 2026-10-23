# 웹 개인정보처리방침 — 근거·운영 확인·시행 절차

> 2026-10-20 결정([decisions](decisions.md) ⑤): 웹과 앱은 **같은 운영자**(ucmnuniverse)지만 계정·서버·DB가 따로라 개인정보처리방침을 **각자** 둔다. 원문은 웹 [`src/pages/Privacy.tsx`](../../src/pages/Privacy.tsx)(`/privacy`), 앱은 앱 웹 `/privacy`(flexable-app `docs/play-store/privacy-policy.md`). 웹 방침은 **2026-10-21 시행**(`lib/legal.ts` `WEB_PRIVACY_EFFECTIVE`). 처음 10-28(7일 고지)로 잡았다가 앱 연동을 10-21부터 켜기로 해(사용자 결정) 당겼다. 웹 백엔드(solpa)가 10-21에 처음 열린 서비스라 바꾸는 방침이 아니라 첫 방침으로 보고 바로 시행한다(법적 판단 최종 확인은 담당자). 시행일 코드는 날짜로 링크를 바꾸므로(시행 전에는 `/privacy` "시행 예정"·하단 시행 안내) 다음 개정에도 쓴다. `VITE_API_URL`로 앱 서버를 부르는 배포(지금 Vercel)는 회원 정보를 앱 서버가 처리하므로 계속 앱 방침을 가리킨다.

## 0. 2026-10-21 법률 검토 반영

외부 법률 검토 의견(코드·서버·계약서를 직접 검증한 의견서는 아님)을 받아 방침을 13개 조로 다시 썼다. 결정과 남은 확인:

| 검토 쟁점 | 반영 |
|---|---|
| 개인정보처리자 식별 | **강선후**(운영 이름 ucmnuniverse)를 처리자·보호책임자로 적는다(사용자 결정). 앱 방침도 같게 맞춘다 |
| 방침 전체 동의 ≠ 처리 근거 | 가입·로그인·설정은 계약 이행(법 15조1항4호)으로 처리하고 가입 화면은 **안내**만 한다(사용자 결정). 웹 백엔드 가입은 `agreePrivacy`를 받지 않고 `users.privacy_agreed_at`은 V7부터 NULL 허용(그 전 가입자의 동의 시각은 그대로). 앱 서버를 부르는 배포(Vercel)는 앱 가입 규칙대로 체크박스 유지 |
| 앱 연동은 선택 동의 | 웹 연동 카드에 처리자·목적·항목·보유 기간·거부 권리와 영향을 보여 주고 [동의하고 연동하기]. 앱 코드 발급 화면에도 같은 동의(앱 담당) |
| 앱 해제가 "다음 조회 때"만 반영 | `AppLinkRecheckJob`이 매일 03:20(KST) 모든 연동을 다시 확인 → 앱 해제·탈퇴는 늦어도 다음 날 새벽 반영 |
| 탈퇴 "즉시 모든 정보 파기" | 운영 DB(지체 없이)·백업(최대 7일)·기록(최대 7일)을 나눠 적음. 백업 복원 시 삭제 재적용 절차는 `deploy/vm/README.md` |
| 로그 50MB(용량만) | 접속·오류 기록 **최대 7일**(사용자 결정). `deploy/vm/purge-logs.sh` 매주 root cron |
| 백업 `-mtime +7`은 8일째 삭제 | `backup.sh`를 분 단위(`7일 − 1시간`)로 바꿔 만든 때부터 최대 7일 |
| 관리자 접근 기록 1년 | 일반 접속 기록과 구분. VM `auth.log` 1년 보관(logrotate)·월 1회 점검, VM 종료 전 반출(`deploy/vm/README.md`) |
| Vercel 행 | solpa 화면은 VM nginx가 직접 제공해 Vercel이 처리하지 않음 → 웹 방침에서 뺐다. Vercel 배포는 앱 계정·앱 방침(제1조3항) |
| 국외 이전 | 웹 서버·DB는 국내. **문의 메일 Gmail(Google LLC, 미국 등)**을 국외 보관으로 적음(사용자 결정). 문의 처리 후 30일 이내 삭제를 운영자가 지켜야 함 |
| 실패 제한 10분 | 실제 동작대로: 각 실패 시각부터 10분, 메모리에서는 다음 정리 때·재시작 때 삭제 |
| 시행일 10-21 | solpa 백엔드가 10-21 처음 열렸고 그 전 가입은 팀 시험 계정뿐. 같은 날 보완해 변경 이력에 적음 |

**남은 확인(운영자)**: ① 대한상공회의소의 정확한 기관명·재수탁·VM 스냅숏/백업 여부와 보관 기간(아카데미에 문의) ② 위탁 관계 문서(목적 외 처리 금지·안전조치·종료 시 파기)를 아카데미와 주고받을 수 있는지 ③ 오늘 solpa에서 만든 시험 계정 정리 ④ 문의 메일 30일 삭제 습관 ⑤ 만 14세 미만 가입 제한을 화면 문구 말고 확인 절차로 둘지.

## 0-1. 2026-10-23 AI 목표 달성 개정

F7 AI 목표 달성([명세](goal-ai.md))으로 목표 정보 저장과 OpenAI 국외 처리가 생긴다. 제2조(목표 설정·AI 목표 안내)·제4조(보유 기간)·제6조(OpenAI 위탁·국외 이전)를 추가했다. 제13조는 시행 7일 전 고지가 원칙이지만, 웹 회원이 아직 없어 불이익을 받을 기존 이용자가 없으므로 기능과 같은 날(2026-10-23) 시행했다(사용자 결정, decisions 2026-10-23 ②). 회원이 생긴 뒤의 변경은 7일 전에 예고한다.

**남은 확인(운영자)**: ① OpenAI 계약 주체(한국 이용자 API 계약은 OpenAI, L.L.C.로 적음)와 개인정보 요청 창구 주소 ② OpenAI 조직 설정의 데이터 보관(악용 모니터링 30일, 무보관 승인 여부) ③ OpenAI에 보내는 숫자가 다른 정보와 결합하지 않으면 개인을 알아볼 수 없는 정보인지(현재는 보수적으로 국외 이전으로 적음).

## 1. 원칙

- **구현 기준으로 쓴다.** 실제로 처리하는 것만, 실제 동작대로(삭제 시점 등은 코드 그대로) 적는다. 계획만 있는 기능(사용 지표 이벤트, 결제 등)은 넣지 않고 도입 전에 개정한다(사용 지표는 decisions 확정 16).
- 배포 전 항목은 배포와 같은 날 시행되게 넣는다(예: 앱 주기별 반영 기록 — 아래 4).
- 운영자·보호책임자·문의처·권리 행사·만 14세 미만·변경 고지(시행 7일 전) 문구는 앱 방침과 **같게** 유지한다.
- 앱·웹 모두 강선후가 처리자이므로 앱→웹 연동은 제3자 제공이 아니라 같은 처리자의 선택 동의 기반 이용으로 적는다(법 15조1항1호). 처리자가 달라지면 제3자 제공으로 다시 설계한다.
- **코드를 바꿔 웹이 처리하는 개인정보가 달라지면 같은 PR에서 이 문서의 표와 `Privacy.tsx`를 고친다**(AGENTS.md).

## 2. 방침 항목 ↔ 근거

| 방침 항목 | 근거(코드·테이블) |
|---|---|
| 이메일, 비밀번호(BCrypt) | `users.email`(user), `user_credentials.password_hash`(auth, `SecurityConfig` BCrypt) |
| 카카오·Google 회원 식별값, 확인된 이메일 | `user_identities`(auth). 확인되지 않은 이메일은 저장하지 않음(`RestOAuthProviderClient`·`OAuthUserService`) |
| 앱 연동 항목 | `app_links`(applink, V3): `app_email`·`app_provider`, `seed_*`, `link_id_cipher`(AES-256-GCM, `LinkIdCipher`) |
| 시작일·주기별 반영 기록 | `app_links.seed_started_on`, `app_link_entries`(V6: 주기 종료일·방법·금액·반영 후 합계·반영 일시). 조회마다 통째로 바꾸고 연동 행 삭제 시 함께 삭제(FK CASCADE) |
| 동의·가입 일시, 가입 방법 | `users.terms_agreed_at`·`created_at`, `user_identities.provider`. `privacy_agreed_at`은 10-21 전 가입자만(V7) |
| 화면 설정 | `user_settings`(theme·seen_tours·disclaimer_ack_at) |
| 연동 일시·마지막 조회 일시 | `app_links.created_at`·`synced_at`·`checked_at` |
| 서버 오류 기록의 회원 번호 | `AppLinkService` 경고·오류 로그의 `userId`(이메일·linkId는 남기지 않음) |
| 웹 서버 접속 기록 | `deploy/vm/nginx.conf` `log_format web_access`: IP(앞단 프록시 주소일 수 있음)·일시·메서드·경로(쿼리 제외)·응답 코드·크기·브라우저 정보 |
| 기록 최대 7일·50MB | `deploy/vm/purge-logs.sh`(매주 일요일 04:00 root cron), `docker-compose.yml` 로그 회전 10MB × 5개 |
| 백업 매일·만든 때부터 최대 7일 | `deploy/vm/backup.sh`(`-mmin +(7일−1시간)`, 파일 권한 600), VM crontab 매일 04:00 |
| 앱 해제 늦어도 다음 날 새벽 반영 | `applink.AppLinkRecheckJob`(매일 03:20 KST, `AppLinkService.recheckAll`) |
| 연동 코드는 저장하지 않음 | `AppLinkService.link` → `AppApiClient.create`로 전달만, DB·로그에 없음 |
| 문의 메일 국외 보관 | Gmail(Google LLC). 처리 후 30일 이내 삭제(운영자 수작업) |
| 수탁자 대한상공회의소 | 웹 VM 제공 기관. 관리자 권한으로 VM에 접근할 수 있음(10-21 확인). 정확한 기관명·스냅숏은 확인 전(0) |
| 브라우저 저장 | `localStorage` `fx.token`(`lib/api.ts`), `fx.theme`(`lib/theme.ts`), `fx.landHint`(`pages/Landing.tsx`), `fx.news.saved`·`fx.news.filter`(`data/newsSaved.ts`), `sessionStorage` `fx.oauth.verifier`(`auth/oauth.ts`). 쿠키·분석 도구 없음 |
| 탈퇴 시 즉시 파기 | `UserService.withdraw` → `AppLinkService.removeForWithdrawal`, `AuthService.onWithdraw`, 외래 키 `ON DELETE CASCADE` |
| 연동 해제·앱 해제·앱 탈퇴 확인 시 파기 | `AppLinkService.unlink`, `sync`·`AppLinkRecheckJob`의 `LINK_NOT_FOUND` 처리. 앱 탈퇴 시 앱이 연동을 함께 지우므로 같은 경로 |
| 실패 기록 메모리 10분 | `common.AttemptLimiter`(로그인: 이메일별, 연동 코드: 웹 회원 번호별 실패 시각). 지난 기록은 다음 정리·재시작 때 삭제 |
| 목표·AI 목표 안내(10-23 시행) | `goals`·`goal_coaches`·`goal_coach_usage`(engagement, V8). 탈퇴 시 `UserWithdrawalListener`로 삭제, `goal_coach_usage`는 날짜로부터 7일 지나면 매일 정리 작업이 삭제. 서버 전체 횟수 `ai_daily_usage`는 회원 정보 없음 |
| OpenAI 국외 처리(10-23 시행) | `ai` 패키지 OpenAI 클라이언트: 목표 종류·금액·기한·계산값만 전송(이름·이메일·회원 번호 제외), `store: false`, `user` 미전송. OpenAI 악용 모니터링 보관 최대 30일([OpenAI 데이터 안내](https://platform.openai.com/docs/guides/your-data)). 로그는 결과 구분·토큰 수만 |
| 비회원 체험은 서버 저장 없음 | 로그인 전 화면은 예시 데이터만 사용(`isSample`) |

## 3. 시행 전 확인 항목(10-21 모두 채움)

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

**11-18 웹 VM 종료**: 대한상공회의소 VM은 11-18 이후 닫힌다. 그 뒤 웹 백엔드·DB를 어디로 옮길지(또는 웹 계정 데이터를 파기할지) 정하고, 수탁자·백업·기록 문구를 고친 방침을 **11-11까지 고지**(7일 전)한다. 화면만 Vercel로 돌아가고 웹 백엔드가 없으면 웹 계정 기능은 쓸 수 없다.

## 4. 앱 쪽과 맞출 것

- 앱 방침에 "이용자가 웹 연동을 하면 웹(같은 운영자)에서 이용하는 항목·목적, 앱 설정에서 해제 가능"을 넣는다. 앱 담당 협의안(flexable-app `docs/web-seed-entries-handoff.md`)의 문구를 기준으로 하되, 항목 목록은 이 문서 2와 같게 맞춘다.
- **주기별 반영 기록·시작일(`startedOn`)**: 10-21 웹 방침 1항 "앱 연동"에 넣고 같은 날 시행했다. 앱 API는 main에 머지됐고 운영 배포는 앱 담당(10-21 요청).
- **앱 방침**: 이미 시행 중인 앱 방침을 바꾸는 것이므로, 앱은 연동 코드 발급 화면에서 제공 항목을 보여 주고 동의를 받은 뒤 코드를 준다(10-21 앱 담당에 요청). 웹도 코드 입력 화면에 받는 항목을 안내한다.
  - **반영됨(2026-10-21):** 앱 1.4.0 production 원격 업데이트를 10-21 17:51 KST에 게시했다(업데이트 그룹 `5822362e-5688-4c1e-a22b-ced4e06e0bf0`, 앱 커밋 `7097b55`, 실기기 반영 확인). 앱 방침 개정(10-28 시행)과 연동 코드 발급 전 선택 동의가 들어 있다. 앱 방침의 웹 연동 보유 기간에 "앱 회원 탈퇴"가 들어가(앱 탈퇴 시 연동도 함께 삭제) 웹 방침 제4조 보유 기간도 같게 맞췄다(제3조제4항은 이미 앱 탈퇴를 안내).
- 앱 HANDOFF의 "이후 유동자산 집계"는 04 §5-2 범위 밖이다. 넘기려면 04와 두 방침을 먼저 고친다.

## 5. 시행 절차

1. 3의 확인 항목을 모두 채운다.
2. 시행일을 정한다. 웹 백엔드로 가입을 받기 **전**이어야 하며, 앱 방침 개정과 같은 날로 맞추는 것을 권한다.
3. 시행 7일 전: `/privacy` 초안 안내를 "○월 ○일 시행 예정"으로 바꾸고 웹에 알린다.
4. 시행일: `lib/legal.ts`의 `WEB_PRIVACY_EFFECTIVE`에 날짜를 넣어 가입·로그인·하단 링크를 웹 방침으로 바꾼다. `APP_LINK_BASE_URL`은 이 뒤에 넣는다([HANDOFF](HANDOFF.md)).
5. 이미 앱 방침에 동의하고 웹 백엔드로 가입한 회원이 있으면, 시행일에 다시 동의를 받을지 정한다(웹 백엔드 운영 전이면 해당 없음).
