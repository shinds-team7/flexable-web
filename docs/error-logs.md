# 오류 기록 보는 법(웹 DB `error_events`)

브라우저에서 난 오류와 웹 서버 500은 웹 MySQL의 `error_events` 테이블에 쌓인다. 전용 화면은 없어서 서버에 접속해 SQL로 본다. 왜 이렇게 했는지는 [결정](decisions/2026-11-08-error-events.md)에 있다. 앱 서버에도 같은 이름의 테이블이 따로 있으니 섞이지 않게 웹 VM의 DB인지 확인한다.

> **조회(`SELECT`)만 한다.** `UPDATE`·`DELETE`·`DROP`은 하지 않는다. 30일 지난 기록은 서버가 매일 04:30(KST)에 지운다.
> 기록에는 회원 번호(`user_id`)가 있다. 결과를 메신저·이슈·PR에 붙일 때는 `user_id` 열을 빼고, 공개 저장소에는 올리지 않는다.

## 1. 접속

DB 비밀번호는 VM의 `.env`에만 있고 아래 명령이 컨테이너 안에서 읽는다. 비밀번호를 따로 받을 필요가 없다.

| 기간 | 서버 | 접속 |
|---|---|---|
| 지금 | 웹 VM(`solpa.shinhanacademy.co.kr`, 아카데미 네트워크에서만) | VM에 SSH 접속([deploy/vm/README.md](../deploy/vm/README.md)) |
| AWS(EC2) 이전 뒤 | EC2 | 이전하면 이 표를 고친다 |

접속한 뒤:

```bash
cd ~/flexable-web/deploy/vm
docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
```

`mysql>` 프롬프트가 나오면 아래 SQL을 붙여 넣는다. 나갈 때는 `exit`. 결과가 옆으로 길면 SQL 끝의 `;`를 `\G`로 바꾸면 한 줄씩 세로로 나온다. 한글이 깨지면 먼저 `set names utf8mb4;`를 입력한다.

## 2. 자주 쓰는 SQL

**최근 오류 50건**(먼저 이것부터)

```sql
select last_at, source, kind, status, code, method, path, message, occurrences, app_version
from error_events order by last_at desc limit 50;
```

**오늘 많이 난 순서**

```sql
select source, kind, status, code, path, message, occurrences
from error_events where event_day = current_date order by occurrences desc limit 20;
```

> 서버 시간대가 KST가 아니면 `current_date`가 하루 어긋날 수 있다. 그때는 `where event_day = '2026-11-09'`처럼 날짜를 직접 적는다.

**날짜별 건수(최근 30일)**

```sql
select event_day, source, count(*) kinds, sum(occurrences) total
from error_events group by event_day, source order by event_day desc, source;
```

**한 건 자세히**(스택·화면 포함, `id`는 위 결과에서 `select id, ...`로 함께 뽑는다)

```sql
select * from error_events where id = 123\G
```

**서버 500만**

```sql
select last_at, method, path, message, occurrences from error_events
where source = 'SERVER' order by last_at desc limit 20;
```

**특정 API만**(예: 적금 계산 실패)

```sql
select last_at, status, code, message, occurrences from error_events
where path like '/api/v1/savings%' order by last_at desc limit 20;
```

**화면이 깨진 것(오류 경계)**

```sql
select last_at, screen, message, occurrences from error_events
where kind = 'CRASH' order by last_at desc limit 20;
```

## 3. 열 읽는 법

| 열 | 뜻 |
|---|---|
| `event_day` | 오류가 난 날(KST). 같은 날 같은 오류는 한 줄로 묶인다 |
| `occurrences` | 그날 그 오류가 난 횟수 |
| `first_at` / `last_at` | 그날 처음·마지막으로 난 시각 |
| `source` | `WEB`(브라우저가 보냄) / `SERVER`(서버가 직접 남긴 500) |
| `kind` | `API`(브라우저가 받은 4xx·5xx 응답), `CRASH`(화면이 깨져 오류 화면이 뜸), `JS`(처리 못 한 브라우저 코드 오류·거부된 약속), `SERVER`(서버 500) |
| `status` / `code` | HTTP 상태와 서버 오류 코드(예: `400` / `VALIDATION_FAILED`). 코드 뜻은 [web-api.yaml](contracts/web-api.yaml)·`ErrorCode` |
| `method` / `path` | 요청 종류와 주소. 쿼리는 없고 숫자·긴 id는 `{id}`로 바뀌어 있다 |
| `screen` | 오류가 났을 때 브라우저 주소의 경로(`/savings` 등, 서버 500은 비어 있음) |
| `message` / `stack` | 오류 문구와 스택 앞부분. 문구의 3자리 이상 숫자는 `#`, 이메일은 `***@***`로 가려져 있다(스택은 이메일만) |
| `app_version` / `platform` | 웹 빌드 버전(설정하지 않으면 비어 있음), 브라우저는 `web` |
| `user_id` | 마지막으로 겪은 회원 번호(로그인 전이면 비어 있음). 밖으로 옮기지 않는다 |

기록되지 않는 것: 연결 끊김(서버에 닿지 않음), 401(로그인 만료), 사용자가 고칠 수 있는 예상 오류(로그인 실패, 시도 횟수 초과, 대회 기간 아님 등 — `src/lib/errorReportRules.ts`의 `EXPECTED_CODES`), 서버가 직접 처리해 응답한 4xx(서버는 500만 남긴다). 브라우저는 한 번 페이지를 연 동안 20건, 서버는 보낸 사람마다 10분에 30건, 하루 새 줄 500개까지만 저장한다. 앱 서버를 쓰는 배포(`VITE_API_URL`이 있는 빌드)는 보내지 않는다.

> 서버 로그(Docker 파일 로그, 최대 7일)와는 별개다. 접속 기록(IP)과 서버 전체 로그는 거기에만 있고, 이 테이블은 오류만 가려서 30일 둔다.

## 4. 오류를 찾았을 때

1. 같은 `path`·`code`가 여러 날 이어지는지(날짜별 건수 SQL) 본다. 하루 한두 번이면 대개 일시적이다.
2. 고쳐야 하면 GitHub Issue를 만든다. 본문에는 `kind`·`status`·`code`·`path`·`message`·날짜·횟수만 적고 `user_id`는 적지 않는다.
3. 서버 500이면 서버 로그도 같이 본다: `cd ~/flexable-web/deploy/vm && docker compose logs --since 1h api | grep -i error`.
