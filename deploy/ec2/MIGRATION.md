# 웹 VM → EC2 이전 절차

웹 VM(`solpa.shinhanacademy.co.kr`)의 웹 DB·설정을 앱 EC2로 옮기고 새 웹 도메인으로 연다. 구성은 [README](README.md), 결정은 [2026-11-20](../../docs/decisions/2026-11-20-web-on-app-ec2.md).

- **명령은 위에서부터 한 줄씩** 아카데미 PC의 Git Bash에 붙여 넣는다. 채팅 답변을 터미널에서 복사하면 줄 끝에 테두리 문자 `│`가 따라와 명령이 깨지니 이 파일(GitHub 화면)에서 복사한다.
- `<웹 도메인>`은 새로 정한 주소(두 번째 DuckDNS 서브도메인)로 바꿔 넣는다. VM IP·계정·비밀번호·`.env` 값은 이 문서·메신저·커밋에 적지 않는다.
- 점검 시간은 약 1시간. 웹은 11-24 면접까지만 살아 있으면 되고 앱이 우선이다. 앱 EC2 작업(t3.small 변경·Caddy·swap)이 끝난 뒤에 한다.

## 0. 미리 할 일(사람, 집에서 가능)

| # | 할 일 | 어디 |
|---|---|---|
| 0-1 | DuckDNS에 두 번째 서브도메인을 만들고 앱 EC2 탄력적 IP를 넣는다. `nslookup <웹 도메인>`이 EC2 IP인지 확인 | DuckDNS |
| 0-2 | 앱 Caddyfile에 웹 도메인 블록(README "Caddy 연결")을 넣어 배포한다. 웹이 아직 없으니 502여도 인증서만 발급되면 된다 | flexable-app(앱 담당) |
| 0-3 | **카카오 Developers** → 앱 → 카카오 로그인 → Redirect URI에 `https://<웹 도메인>/api/v1/auth/oauth/kakao/callback` **추가**, 플랫폼 → Web 사이트 도메인에 `https://<웹 도메인>` **추가**. 옛 solpa 주소는 VM을 지울 때까지 남긴다 | 카카오 콘솔 |
| 0-4 | **Google Cloud 콘솔** → API 및 서비스 → 사용자 인증 정보 → 웹 OAuth 클라이언트 → 승인된 리디렉션 URI에 `https://<웹 도메인>/api/v1/auth/oauth/google/callback` **추가**. 동의 화면의 승인된 도메인에 `duckdns.org`가 없으면 추가 | Google 콘솔 |
| 0-5 | 이 이전 PR을 병합한다(EC2가 main의 `deploy/ec2`를 쓴다). `DEPLOY_TARGET`이 아직 없어 VM 배포가 한 번 돌 수 있는데 그대로 둔다 | GitHub |
| 0-6 | 0-5 뒤에 EC2 준비: README "처음 한 번"(작업 폴더 clone·배포 키)과 GitHub secret·변수(`DEPLOY_TARGET` 빼고) | EC2·GitHub |
| 0-7 | 이용자에게 점검 시간과 새 주소를 알린다(앱 화면의 웹 주소 문구는 앱 담당이 고친다) | 공지 |

앱 서버 쪽 값은 바꾸지 않는다: 웹 → 앱 연동은 서버끼리 부르는 것이라 앱 `CORS_ORIGINS`에 웹 도메인이 필요 없고, 웹 `.env`의 `APP_LINK_BASE_URL`(앱 서버 주소)·`APP_LINK_SERVICE_KEY`·`APP_LINK_ENCRYPTION_KEY`는 그대로 옮긴다(암호화 키를 바꾸면 저장된 연동을 못 읽는다).

## 1. SSH 준비(아카데미 PC, 처음 한 번)

`~/.ssh/config`에 두 서버 별칭을 둔다. `<웹 VM 주소>`·`<VM 계정>`·`<EC2 주소>`는 팀 비공개 공간의 값.

```bash
cat >> ~/.ssh/config <<'EOF'
Host web-vm
  HostName <웹 VM 주소>
  User <VM 계정>
Host flex-ec2
  HostName <EC2 주소>
  User ubuntu
  IdentityFile ~/.ssh/sh-flex.pem
EOF
```

```bash
ssh web-vm 'hostname && docker compose -f ~/flexable-web/deploy/vm/docker-compose.yml ps --format "{{.Service}} {{.Status}}"'
ssh flex-ec2 'free -m && df -h / | tail -1 && ls /opt/flexable-web/deploy/ec2/docker-compose.yml'
```

EC2 SSH가 막히면 보안 그룹 SSH(22) 소스에 아카데미 PC 공인 IP(`curl -s https://checkip.amazonaws.com`)를 넣는다.

## 2. 웹 VM: 쓰기 멈춤 → 덤프 → 행 수 → `.env`·`auth.log` 회수

여기부터 점검 시작이다. **먼저 VM 자동 배포를 막는다**: GitHub 저장소 Settings → Variables에 `DEPLOY_TARGET=ec2`를 넣고, Actions의 **deploy** 실행 중·대기 중인 것이 없는지 본다(있으면 끝날 때까지 기다린다). VM 배포가 덤프 뒤에 api를 다시 켜면 그 뒤의 쓰기가 EC2로 옮겨지지 않는다. EC2 쪽 자동 배포는 복원(`.restored`) 전이라 진행되지 않는다.

```bash
gh run list -R shinds-team7/flexable-web --workflow deploy --limit 3
```

api·worker를 멈추고(db는 둔다) 덤프·행 수·`.env` 사본을 `~/web-migrate`에 만든다.

```bash
ssh web-vm 'cd ~/flexable-web && git fetch -q origin main && git show origin/main:deploy/ec2/vm-export.sh | bash -s -- --stop-writes ~/web-migrate'
```

`[export] 완료`가 나와야 한다. 행 수를 눈으로 본다(`users` 등 표마다 한 줄, 마지막에 `flyway_version`).

```bash
ssh web-vm 'cat ~/web-migrate/count-rows.txt'
```

`auth.log`를 읽지 못했다고 나왔으면 sudo로 회수한다(비밀번호를 물으면 VM 계정 비밀번호).

```bash
ssh -t web-vm 'sudo sh -c "cp /var/log/auth.log* ~$USER/web-migrate/auth-log/ && chown -R $USER ~$USER/web-migrate/auth-log"'
```

## 3. 아카데미 PC로 옮기고 EC2로 보내기

```bash
umask 077 && mkdir -p ~/web-migrate && cd ~/web-migrate
scp -r web-vm:web-migrate/. .
ls -la . auth-log
```

**`auth-log/`는 운영자 PC에 1년 보관한다**(방침 제9조, 웹 회원 정보 없음). 아카데미 PC에 남기지 말고 운영자 PC·개인 저장소로 옮긴다.

```bash
ssh flex-ec2 'git -C /opt/flexable-web pull -q --ff-only origin main && mkdir -p /opt/flexable-web/deploy/ec2/migrate && chmod 700 /opt/flexable-web/deploy/ec2/migrate'
scp flexable_web.sql.gz count-rows.txt vm.env flex-ec2:/opt/flexable-web/deploy/ec2/migrate/
```

## 4. EC2: 복원 → 행 수 비교

`.env`를 VM 것으로 만들고 옛 주소를 새 도메인으로 바꾼 뒤, 웹 db만 띄워 복원하고 행 수를 비교한다. `<웹 도메인>`을 바꿔 넣는다.

```bash
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && WEB_DOMAIN=<웹 도메인> ./ec2-restore.sh'
```

`[restore] 행 수 같음`이 나와야 한다. 다르면 diff가 나오고 멈춘다. 서비스를 켜지 말고 "되돌리기"로 간다.

```bash
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && grep -E "^(OAUTH_CALLBACK_BASE_URL|OAUTH_ALLOWED_REDIRECT_URIS|WEB_SITE_URL)=" .env'
```

세 줄 모두 `https://<웹 도메인>`으로 시작하는지 본다.

## 5. 기동(첫 배포)

**자동 배포(권장)**: (`DEPLOY_TARGET=ec2`는 2단계에서 넣었다) Actions → **deploy-ec2 → Run workflow**(main, `force` 체크). 처음 배포는 `production-migration` 승인을 기다리니 승인한다. 빌드·전송·기동에 10~20분.

**수동(보안 그룹 22를 열지 않았을 때)**: EC2에서 빌드한다. 메모리를 많이 써서 그동안 앱이 느릴 수 있다.

```bash
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && docker compose build api'
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && docker compose build web'
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && docker compose up -d && git -C /opt/flexable-web rev-parse HEAD > /opt/flexable-web/.git/deployed-sha && rm -f .restored'
```

## 6. 확인

```bash
ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && docker compose ps --format "{{.Service}} {{.Status}}"'
ssh flex-ec2 'for i in $(seq 1 30); do curl -fsS 127.0.0.1:8081/api/v1/health && break; sleep 10; done'
curl -s https://<웹 도메인>/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' https://<웹 도메인>/api/v1/market/status
ssh flex-ec2 'free -m && docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"'
```

- health `{"status":"UP"}`가 루프백과 새 도메인 **둘 다**에서 나와야 한다. 루프백만 UP이면 Caddy 연결(README "Caddy 연결"). 지난 VM 502(11-15)처럼 화면만 뜨고 API가 502인 상태로 끝내지 않는다. `/api/v1/market/status`가 200인지 꼭 본다.
- 앱도 확인한다: `curl -s https://<앱 도메인>/api/v1/health`. 앱이 느리거나 OOM이면 웹을 멈춘다(`docker compose stop`).
- 브라우저: `https://<웹 도메인>/home`, `/privacy`(제1조 주소가 새 도메인), 카카오·Google 로그인, 로그인한 회원의 홈 시드머니(앱 연동), `/m/`.
- 웹 백업 cron·로그 삭제 cron을 README "운영"대로 EC2에 등록하고 `./backup.sh`를 한 번 돌린다.

## 7. 웹 VM 데이터 삭제와 러너 해제

6이 끝나고 **하루쯤 문제없으면** 한다(그 전까지 VM이 되돌리기 수단). 늦어도 VM 반납 전, 그리고 이전 덤프는 만든 때부터 7일 안에 지운다(방침 제4조 백업 7일).

```bash
ssh web-vm 'crontab -r; cd ~/flexable-web/deploy/vm && docker compose --profile worker down -v && rm -rf backups ~/web-migrate'
ssh -t web-vm 'sudo crontab -r; cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall'
```

GitHub 저장소 Settings → Actions → Runners → `flexable-vm` 러너 → **Remove**(나오는 `config.sh remove --token …` 명령을 VM `~/actions-runner`에서 실행). 그다음:

```bash
ssh web-vm 'docker image prune -af >/dev/null; rm -rf ~/actions-runner ~/flexable-web; ls ~'
ssh flex-ec2 'rm -rf /opt/flexable-web/deploy/ec2/migrate'
rm -f ~/web-migrate/flexable_web.sql.gz ~/web-migrate/vm.env ~/web-migrate/count-rows.txt
```

아카데미 PC의 `~/web-migrate/auth-log`는 운영자 PC로 옮겼는지 확인한 뒤 지우고, `~/.ssh/config`의 `web-vm` 항목도 지운다. 카카오·Google 콘솔에서 옛 solpa Redirect URI를 지운다. 아카데미에 웹 VM 반납을 알리고, VM용 `deploy.yml`·`deploy/vm` 삭제와 문서 정리는 후속 PR로 한다.

## 되돌리기

| 언제 | 방법 |
|---|---|
| 4·5·6에서 실패(EC2에 이용자 쓰기 없음) | 웹 VM을 다시 켠다: `ssh web-vm 'cd ~/flexable-web/deploy/vm && docker compose up -d'`(worker를 쓰던 경우 `--profile worker` 추가). GitHub 변수 `DEPLOY_TARGET`을 지운다. 이용자에게 옛 solpa 주소를 다시 안내한다. EC2 웹은 `ssh flex-ec2 'cd /opt/flexable-web/deploy/ec2 && docker compose down -v && rm -f .env .restored'`로 비워 다음 시도 때 다시 복원한다 |
| 6 뒤 EC2에서 이용자가 쓰기 시작한 다음 | EC2에서 `vm-export.sh`와 같은 방법으로 덤프해 VM에 복원해야 쓰기 내용이 살아난다. 웹은 11-24까지만 쓰므로 보통은 EC2에서 고친다(README "되돌리기(이미지)") |
| 7 뒤 | VM이 없으므로 EC2의 `backups/`(매일 덤프)로만 복원한다 |

## 선택: 집에서 덤프 받기(VM 러너가 살아 있을 때)

아카데미 PC 없이 2단계를 대신한다. 덤프·행 수·`.env`·(읽을 수 있으면) `auth.log`를 **운영자 공개 인증서로 암호화한 묶음만** 아티팩트(1일 보관)로 올린다. 공개 저장소라 아티팩트는 로그인한 누구나 받을 수 있으므로 평문은 절대 올리지 않고, 개인 키는 운영자 PC에만 둔다.

운영자 PC(Git Bash)에서 처음 한 번 키를 만든다.

```bash
umask 077 && mkdir -p ~/web-migrate && cd ~/web-migrate
openssl req -x509 -newkey rsa:4096 -nodes -days 30 -subj "/CN=flexable-web-migrate" -keyout migrate-key.pem -out migrate-cert.pem
cat migrate-cert.pem
```

`cat` 결과(공개 인증서, `-----BEGIN CERTIFICATE-----`부터 끝까지)를 GitHub 저장소 Settings → Variables `DUMP_RECIPIENT_CERT`에 넣는다. `migrate-key.pem`은 어디에도 올리지 않는다.

Actions → **vm-dump → Run workflow**(main). 리허설은 `stop_writes` 끔, 실제 이전은 켬(VM의 api·worker를 멈춘다). `production-migration` 승인 뒤 돈다. 끝나면 받는다(`<실행 번호>`는 Actions 화면의 run id).

```bash
cd ~/web-migrate && gh run download <실행 번호> -R shinds-team7/flexable-web -n flexable-web-vm-encrypted
openssl cms -decrypt -binary -inform DER -inkey migrate-key.pem -in flexable-web-vm.tgz.cms -out bundle.tgz
tar -xzf bundle.tgz && rm -f bundle.tgz flexable-web-vm.tgz.cms && ls -la . auth-log
gh api -X DELETE repos/shinds-team7/flexable-web/actions/artifacts/$(gh api repos/shinds-team7/flexable-web/actions/runs/<실행 번호>/artifacts --jq '.artifacts[0].id')
```

그다음은 3단계의 `ssh flex-ec2 'mkdir …'`·`scp …`부터 같다(집에서 EC2에 SSH가 되면). `auth.log`가 빠졌으면(러너 계정 권한) 아카데미에서 2단계의 sudo 명령으로 따로 회수한다. 이전이 끝나면 `migrate-key.pem`·`migrate-cert.pem`과 변수 `DUMP_RECIPIENT_CERT`를 지운다.
