# 웹 EC2 배포

아카데미 웹 VM이 꺼져 웹 화면·웹 백엔드·웹 DB를 **앱(flexable-app)이 쓰는 EC2(t3.small, 2GB)** 에 함께 올린다([결정](../../docs/decisions/2026-11-20-web-on-app-ec2.md)). 웹은 11-24 면접까지 살아 있으면 되는 최소 구성이고, 메모리가 모자라면 **앱이 우선**이다. 옮기는 순서는 [MIGRATION.md](MIGRATION.md).

서버·AWS·DNS·OAuth 콘솔·GitHub 설정은 사람이 한다(AGENTS.md "하지 않는 것"). EC2 IP·계정·키·`.env` 값은 저장소에 적지 않는다.

## 구성

```text
브라우저 ─▶ https://<웹 도메인> ─▶ 앱 Caddy(443, TLS, flexable-app 저장소)
        ─▶ 호스트 127.0.0.1:8081 ─▶ web(nginx) ── /api/ ──▶ api(:8080) ──▶ db(웹 전용 MySQL 8.4, 포트 없음)
                                                     worker(시세 수집, 기본 꺼짐) ──▶ db
```

| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | 서비스 구성. 프로젝트 이름 `flexable-web`(앱 compose와 이름·볼륨이 겹치지 않음). 컨테이너마다 `mem_limit` |
| `docker-compose.caddy-net.yml` | 선택. Caddy가 bridge 네트워크 컨테이너라 호스트 루프백에 닿지 못할 때(아래 "Caddy 연결") |
| `web.Dockerfile`, `nginx.conf` | VM 것과 같다. 빌드 인자 `VITE_SITE_URL`로 방침·소개에 표시할 웹 주소를 넣는다 |
| `.env.example` | 환경변수 양식. 실제 `.env`는 웹 VM의 것을 옮겨 주소만 바꾼다 |
| `deploy.sh`, `ssh-entry.sh` | Actions SSH 배포(아래 "배포") |
| `backup.sh`, `purge-logs.sh` | VM과 같다(매일 덤프 7일 보관, 매주 로그 삭제). 경로만 `/opt/flexable-web/deploy/ec2` |
| `vm-export.sh`, `ec2-restore.sh`, `count-rows.sql` | 이전용(MIGRATION.md) |

### 메모리(t3.small 2GB, 앱 우선)

| 컨테이너 | 상한 | 비고 |
|---|---|---|
| 앱 api·앱 MySQL·Caddy | 앱 저장소가 정함 | 먼저 넉넉히 준다 |
| 웹 db | 400MB | 버퍼 풀 64MB, `performance_schema` 끔, 연결 30 |
| 웹 api | 560MB | `-Xmx320m`, SerialGC. `.env`의 `API_JAVA_OPTS`로 바꿈 |
| 웹 web | 64MB | nginx |
| 웹 worker | 450MB | **기본 꺼짐**. 켤 때만 |

웹 합계는 worker 없이 약 1GB 상한이다. 상한에 닿으면 그 웹 컨테이너만 다시 시작되고 앱은 영향받지 않는다. 그래도 호스트 전체가 모자라면(앱 api·앱 MySQL까지 합쳐 2GB를 넘으면) swap(2GB 권장, 앱 저장소 절차)에 기대게 되니 `free -m`과 `docker stats --no-stream`을 본다. 앱이 느려지면 웹 worker부터 끄고, 그다음 웹 전체를 멈춘다(`docker compose stop`).

**MySQL은 앱과 공유하지 않는다.** 공유하면 약 300MB를 아끼지만, 웹 쿼리·복원이 앱 DB 성능과 장애에 직접 영향을 주고 웹 방침의 "앱과 계정·저장 환경을 구분" 문구와 백업·삭제 주기를 다시 맞춰야 한다. 웹 전용 컨테이너에 상한을 걸어 웹이 죽어도 앱 DB는 그대로이게 한다.

### Caddy 연결

계약: 웹은 호스트 `127.0.0.1:8081`에만 열고 외부 공개·TLS는 앱 Caddy가 한다. 앱 Caddyfile에 웹 도메인 블록이 필요하다(앱 저장소 담당).

```caddyfile
{$WEB_DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:8081
}
```

**주의**: Caddy가 bridge 네트워크의 Docker 컨테이너면 그 안의 `127.0.0.1`은 Caddy 자신이라 호스트 8081에 닿지 않는다. 둘 중 하나로 한다.

1. Caddy를 `network_mode: host`로 띄운다(앱 api도 호스트 포트로 열어야 함, 앱 저장소 결정).
2. 웹 `.env`에 `COMPOSE_FILE=docker-compose.yml:docker-compose.caddy-net.yml`, `CADDY_NETWORK=<앱 compose 네트워크 이름>`(예: `flexable_default`, `docker network ls`로 확인)을 넣고, Caddyfile은 `reverse_proxy flexable-web:80`으로 한다. 루프백 8081은 확인용으로 그대로 남는다.

nginx는 Caddy가 준 `X-Forwarded-For`·`X-Forwarded-Proto`를 넘기고, 웹 백엔드는 `forward-headers-strategy: framework`로 읽는다.

## 배포

**GitHub Actions → SSH**(`.github/workflows/deploy-ec2.yml`). 셀프 호스트 러너는 EC2에 두지 않는다. VM에 러너를 쓴 이유(외부에서 SSH로 닿지 않음)가 EC2에는 없고, 앱과 같이 쓰는 2GB 서버에 상주 러너와 이미지 빌드를 얹지 않기 위해서다.

1. 저장소 변수 `DEPLOY_TARGET=ec2`일 때만 돈다(그동안 VM용 `deploy.yml`은 쉰다).
2. `main` CI 성공 → `plan`(SSH로 `deploy.sh plan`) → 바뀐 게 있으면 GitHub 호스팅 러너에서 api·web 이미지를 빌드 → `docker save | ssh … load` → `deploy.sh apply`(백업 확인 → ff-only → 이미지 교체 → `127.0.0.1:8081/api/v1/health` 확인).
3. 새 Flyway 파일이 있거나 처음 배포면 `production-migration` 승인 뒤에만 진행한다. 실패하면 자동으로 되돌리지 않는다.
4. 처음 배포는 `ec2-restore.sh`가 만든 `.restored`가 있어야 진행된다(빈 DB에 Flyway가 새 표를 만드는 것을 막음).

### 처음 한 번(사람)

EC2(앱이 쓰는 계정, 예: `ubuntu`)에서:

```bash
sudo mkdir -p /opt/flexable-web && sudo chown "$USER":"$USER" /opt/flexable-web
git clone https://github.com/shinds-team7/flexable-web.git /opt/flexable-web
ssh-keygen -t ed25519 -N "" -f ~/flexable-web-deploy -C flexable-web-deploy     # 배포 전용 키
echo "command=\"/opt/flexable-web/deploy/ec2/ssh-entry.sh\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat ~/flexable-web-deploy.pub)" >> ~/.ssh/authorized_keys
cat ~/flexable-web-deploy    # 이 개인 키를 GitHub secret EC2_SSH_KEY에 넣은 뒤
rm ~/flexable-web-deploy ~/flexable-web-deploy.pub
```

이 키는 `ssh-entry.sh`의 `plan`·`load`·`apply`만 할 수 있다(`plan`·`apply`는 main에 있는 커밋만).

GitHub 저장소 설정(사람):

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `EC2_SSH_HOST` | EC2 탄력적 IP 또는 앱 도메인 |
| Secret | `EC2_SSH_USER` | 위 계정 이름 |
| Secret | `EC2_SSH_KEY` | 위 개인 키 |
| Secret | `EC2_SSH_KNOWN_HOSTS` | 작업 PC에서 `ssh-keyscan -t ed25519 <EC2 주소>` 결과 한 줄(처음 SSH 때 본 지문과 같은지 확인) |
| Variable | `WEB_SITE_URL` | `https://<웹 도메인>` |
| Variable | `DEPLOY_TARGET` | `ec2`(이전 당일 MIGRATION.md 5단계에서) |
| Environment | `production`, `production-migration` | VM 때 만든 것을 그대로 쓴다 |

**보안 그룹**: GitHub 호스팅 러너의 IP는 정해져 있지 않아 SSH(22)를 `0.0.0.0/0`으로 열어야 한다. EC2 Ubuntu는 비밀번호 로그인이 꺼져 있고(키만), 배포 키는 위 명령만 할 수 있다. 22를 열지 않으려면 자동 배포를 쓰지 않고 아래 "수동 배포"만 쓴다(웹은 11-24까지라 배포가 거의 없다).

### 수동 배포(SSH를 열지 않을 때, 사람)

EC2에서 빌드하면 메모리를 많이 써서 앱이 느려질 수 있다. 사람이 적은 시간에, 하나씩 한다.

```bash
cd /opt/flexable-web && git fetch -q origin main && git merge --ff-only origin/main
cd deploy/ec2 && ./backup.sh
docker compose build api && docker compose build web
docker compose up -d && curl -s 127.0.0.1:8081/api/v1/health
git rev-parse HEAD > ../../.git/deployed-sha
```

### 되돌리기(이미지)

`apply`는 health까지 성공한 이미지를 `:good`, 그 전 성공 이미지를 `:previous`로 남기고, 실패한 배포는 두 태그를 바꾸지 않는다. DB 마이그레이션이 없던 배포만 이미지로 되돌린다.

- 배포가 health에서 실패했으면 `:good`(마지막 성공)으로: 아래 `<태그>`에 `good`
- 배포는 성공했는데 화면·기능이 잘못됐으면 `:previous`로: `<태그>`에 `previous`

```bash
cd /opt/flexable-web/deploy/ec2
for i in flexable-web-backend flexable-web-web; do docker tag $i:<태그> $i:latest; done
docker compose up -d
```

마이그레이션이 이미 돌았으면 `backups/`의 직전 덤프와 함께 사람이 판단한다(VM README "복원할 때(방침 제7조)"와 같은 순서).

## 운영

- 백업·로그 삭제 cron, 관리자 접근 기록(`auth.log` 1년), 오류 기록 조회는 [VM README](../vm/README.md)와 같고 경로만 `/opt/flexable-web/deploy/ec2`다. EC2 `auth.log`는 앱과 같은 서버라 앱 저장소의 설정을 함께 쓴다. Actions 배포도 SSH 로그인(`Accepted publickey`)으로 남는다.

```bash
crontab -e         # 0 4 * * * /opt/flexable-web/deploy/ec2/backup.sh >> /opt/flexable-web/deploy/ec2/backups/backup.log 2>&1
sudo crontab -e    # 0 4 * * 0 /opt/flexable-web/deploy/ec2/purge-logs.sh >> /var/log/flexable-purge-logs.log 2>&1
```

- worker 켜기·끄기: `docker compose --profile worker up -d worker` / `docker compose stop worker`. 켜면 시작할 때 시세를 한 번 수집한다(약 1분 동안 메모리를 많이 씀).
- 점검

| 증상 | 확인 |
|---|---|
| 웹 도메인이 안 열림 | `curl -s 127.0.0.1:8081/api/v1/health`가 UP이면 Caddy 쪽(위 "Caddy 연결", 도메인 DNS) |
| API 502 | `docker compose ps`(api가 재시작 중인지), `docker compose logs api --tail 100`(`.env` 누락), `docker inspect -f '{{.State.OOMKilled}}' $(docker compose ps -q api)`가 `true`면 메모리 상한 |
| 소셜 로그인 콜백 오류 | `.env`의 `OAUTH_CALLBACK_BASE_URL`과 공급자 콘솔 Redirect URI가 새 웹 도메인인지 |
| 디스크 | `df -h /`, `docker system df`. 앱 README의 디스크 주의도 본다 |
