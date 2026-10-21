# 웹 VM 배포

아카데미에서 받은 웹 VM(2026-10-21)에 웹 화면·웹 백엔드·웹 DB를 Docker Compose로 띄운다. 서버 작업과 비밀 값 입력은 사람이 한다(AGENTS.md "하지 않는 것").

## 서버

| 항목 | 값 |
|---|---|
| OS·사양 | Ubuntu 22.04, 1코어, RAM 8GB, 디스크 30GB(사용 가능 23GB) |
| 주소 | `https://solpa.shinhanacademy.co.kr` (내부 IP 192.168.0.210) |
| 경로 | 외부 → HTTPS(443, 앞단에서 종료) → VM 80 → `web` 컨테이너 80 |
| 설치됨 | Docker CE·Compose 플러그인, git, curl. `sudo` 가능 |

계정 비밀번호는 저장소·문서·메신저에 적지 않는다. SSH는 가능하면 키로 접속한다.

## 구성

```text
web (nginx, 호스트 80) ── /api/ ──▶ api (웹 백엔드 :8080) ──▶ db (MySQL 8.4, 포트 열지 않음)
                                     worker (시세 수집, --profile worker로 켤 때만) ──▶ db
```

| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | 서비스 구성. 로그는 컨테이너마다 10MB × 5개에서 회전 |
| `web.Dockerfile`, `nginx.conf` | 사이트·`/m` 시연 빌드를 nginx로 서비스하고 `/api/`를 api로 넘긴다 |
| `../../backend/deploy/Dockerfile` | 웹 백엔드 이미지(api·worker 공용). 테스트는 CI가 돌리고 여기서는 jar만 만든다 |
| `.env.example` | 환경변수 양식(이름만). 설명은 [backend/README](../../backend/README.md) "환경 변수" |
| `backup.sh` | DB 덤프를 `backups/`에 만들고 7일 지난 것을 지운다 |

## 처음 띄우기

```bash
git clone https://github.com/shinds-team7/flexable-web.git ~/flexable-web
cd ~/flexable-web/deploy/vm
cp .env.example .env && chmod 600 .env
vi .env        # DB_PASSWORD·WEB_JWT_SECRET·APP_LINK_* 등. 생성 명령은 파일 안 주석
docker compose up -d --build     # 1코어라 첫 빌드는 오래 걸린다
docker compose ps
curl -s localhost/api/v1/health  # {"status":"UP"}
```

브라우저에서 `https://solpa.shinhanacademy.co.kr`를 연다. `.env`를 고친 뒤에는 `docker compose up -d`(다시 만든 컨테이너만 바뀐다).

## 업데이트

```bash
cd ~/flexable-web && git pull
cd deploy/vm && docker compose up -d --build
docker image prune -f
```

DB 구조는 웹 백엔드가 켜질 때 Flyway가 바꾼다. 업데이트 전에 `./backup.sh`를 한 번 돌린다.

## 백업

```bash
chmod +x backup.sh && ./backup.sh
crontab -e   # 0 4 * * * /home/student/flexable-web/deploy/vm/backup.sh >> /home/student/flexable-web/deploy/vm/backups/backup.log 2>&1
```

복원: `gunzip -c backups/<파일>.sql.gz | docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'`. 백업은 같은 VM에 있으므로 VM을 잃으면 함께 잃는다.

## 시세 수집(worker)

`.env`에 키움·KRX 키를 넣은 뒤 `docker compose --profile worker up -d`. 끄려면 `docker compose stop worker`.

## 점검

| 증상 | 확인 |
|---|---|
| 화면은 뜨는데 API가 502 | `docker compose logs api --tail 100`(시작 실패는 대개 `.env` 누락) |
| api가 계속 재시작 | `WEB_JWT_SECRET`·`DB_PASSWORD` 누락, `APP_LINK_BASE_URL`만 있고 `APP_LINK_ENCRYPTION_KEY` 없음 |
| 소셜 로그인 콜백 오류 | `OAUTH_CALLBACK_BASE_URL`과 공급자 콘솔 Redirect URI가 같은지 |
| 디스크 | `df -h`, `docker system df` |

## 바깥 연결

api는 카카오·Google(로그인), 앱 서버(앱 연동)를, worker는 키움·KRX를 HTTPS로 부른다. VM에서 나가는 연결이 막혀 있으면 해당 기능만 실패한다(`curl -sI https://kauth.kakao.com`으로 확인).
