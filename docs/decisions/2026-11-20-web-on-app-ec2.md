# 웹을 앱 EC2로 옮김: 최소 구성, SSH 배포, 새 웹 도메인

- 날짜: 2026-11-20 · 결정한 사람: owner(EC2 동거·새 도메인·앱 우선·11-24까지), 나머지는 이 PR의 제안 · 상태: **제안(PR 병합 = 승인)**
- 이슈: [#470](https://github.com/shinds-team7/flexable-web/issues/470)
- 영향: 웹 배포·운영(프론트·백엔드 공통), 앱(flexable-app) EC2·Caddy, 웹 개인정보처리방침(수탁자·주소). API 계약·정책 계산 변화 없음.

## 배경

아카데미 웹 VM(`solpa.shinhanacademy.co.kr`)이 곧 꺼지고 주소도 함께 사라진다. 웹은 11-24 면접까지만 살아 있으면 된다. 앱은 계속 운영하는 서비스다.

## 결정

1. **앱 EC2(t3.small, 2GB)에 웹 web·api·db를 함께 올린다**(owner). 구성은 [`deploy/ec2/`](../../deploy/ec2/README.md).
2. **앱 우선**(owner): 웹 컨테이너마다 `mem_limit`(db 400MB·api 560MB·web 64MB, worker 450MB)을 걸어 웹이 메모리 부족으로 죽어도 앱은 산다. **worker는 기본으로 끈다**(필요할 때만 `--profile worker`).
3. **웹 MySQL은 앱과 공유하지 않고 웹 전용 컨테이너로 둔다.** 공유하면 약 300MB를 아끼지만 웹 쿼리·복원이 앱 DB에 직접 영향을 주고, 웹 방침의 "앱과 계정·저장 환경 구분"·백업 주기를 다시 맞춰야 한다. 버퍼 풀 64MB로 작게 잡는다.
4. **TLS·도메인은 앱 저장소의 Caddy가 맡는다**(owner). 웹 nginx는 호스트 `127.0.0.1:8081`에만 연다. Caddy가 bridge 컨테이너면 루프백에 닿지 않아 `network_mode: host`나 공유 네트워크(`docker-compose.caddy-net.yml`) 중 하나가 필요하다(앱 담당과 맞춤).
5. **웹 도메인은 두 번째 DuckDNS 서브도메인**(owner). 코드에는 적지 않고 빌드 변수 `VITE_SITE_URL`(없으면 접속한 주소)과 서버 `.env`·GitHub 변수로 둔다.
6. **배포는 GitHub Actions → SSH**로 바꾼다. 셀프 호스트 러너를 EC2로 옮기지 않는다.
   - VM에 러너를 둔 이유(외부에서 SSH 불가)가 EC2에는 없다.
   - 앱과 같이 쓰는 2GB 서버에 상주 러너·이미지 빌드를 얹지 않는다. 이미지는 GitHub 호스팅 러너가 빌드해 `docker save | ssh … load`로 넣는다.
   - 배포 키는 `authorized_keys`의 `command=`로 `deploy/ec2/ssh-entry.sh`(plan·load·apply, main 커밋만)에 묶는다.
   - 대가: 보안 그룹 SSH(22)를 GitHub 러너가 닿게 열어야 한다(키 전용 로그인). 열지 않으면 수동 배포만 쓴다.
   - 저장소 변수 `DEPLOY_TARGET=ec2`로 VM용 `deploy.yml`과 EC2용 `deploy-ec2.yml` 중 하나만 돈다(되돌릴 때 변수만 지움).
7. **처음 배포는 DB 복원(`.restored`) 뒤에만** 진행한다. 빈 DB에 Flyway가 새 표를 만들어 복원과 섞이는 것을 막는다. 처음 배포와 새 마이그레이션은 `production-migration` 승인을 거친다. 실패 시 자동으로 되돌리지 않는 것은 [VM 결정](2026-11-10-vm-cd-github-actions.md)과 같고, 직전 이미지를 `:previous`로 남긴다.
8. **이전 절차**는 [`deploy/ec2/MIGRATION.md`](../../deploy/ec2/MIGRATION.md): VM 쓰기 멈춤 → 덤프 → 행 수 → `.env`·`auth.log*` 회수 → EC2 복원 → 행 수 비교 → 기동 → 확인 → VM 데이터 삭제·러너 해제. VM 러너가 살아 있는 동안은 `vm-dump.yml`로 **운영자 공개 인증서로 암호화한 묶음만** 아티팩트(1일)로 받는 선택지를 둔다.
9. **개인정보처리방침**: 제6조 웹 서버 수탁자를 대한상공회의소 → Amazon Web Services Korea LLC(서울 리전)로, 제1조 주소를 빌드 변수로 바꾼다. 시연 서비스라 7일 전 고지는 하지 않는다. 변경 이력 날짜는 실제 이전일에 맞춘다.

## 도메인 변경 영향

| 대상 | 처리 |
|---|---|
| 웹 `.env` `OAUTH_CALLBACK_BASE_URL`·`OAUTH_ALLOWED_REDIRECT_URIS` | `ec2-restore.sh`가 옛 주소를 새 도메인으로 바꿈, `.env.example` |
| 카카오 Redirect URI·Web 사이트 도메인, Google 승인된 리디렉션 URI | 사람(MIGRATION.md 0-3·0-4). 옛 주소는 VM 삭제 때 지움 |
| 웹 `APP_LINK_BASE_URL`·`APP_LINK_*` | 앱 서버 주소라 그대로. 앱 `CORS_ORIGINS`는 서버끼리 호출이라 웹 도메인 불필요 |
| 웹 소스 하드코딩 | `Privacy.tsx`·`info/web.tsx` → `src/lib/site.ts`, 시연 `mobile-demo` 웹 주소 → 접속 주소 |
| 앱 저장소 화면·방침의 `solpa.shinhanacademy.co.kr` | 앱 담당(`frontend/src/service/config.ts`·`legal.ts`·`WebLinksScreen.tsx`, 앱 업데이트 필요) |
| 문서 | 방침 근거(`privacy-web.md`), `error-logs.md` 접속 표, README. 03·04의 VM 서술과 `deploy/vm` 삭제는 VM 반납 뒤 후속 PR |

## 남은 확인

- 사람: DuckDNS·Caddy·OAuth 콘솔·GitHub secret/변수·보안 그룹, 실제 이전과 확인, VM 데이터 삭제·반납.
- 앱 담당: Caddy가 호스트 루프백에 닿는 방식, swap, 앱 화면의 웹 주소 문구.
- 11-24 뒤 웹을 계속 둘지(끄면 웹 계정 데이터 파기와 방침 정리).
