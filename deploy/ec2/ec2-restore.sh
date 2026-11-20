#!/usr/bin/env bash
# EC2에서 웹 VM 자료를 복원한다(MIGRATION.md). migrate/에 vm-export.sh 결과(flexable_web.sql.gz·count-rows.txt·vm.env)가 있어야 한다.
#   WEB_DOMAIN=<웹 도메인> ./ec2-restore.sh
# .env가 없으면 vm.env를 복사하고 옛 주소(solpa)를 새 웹 도메인으로 바꾼다. db만 띄워 빈 DB에 복원하고 행 수를 비교한다.
# 행 수가 같으면 .restored를 만든다(이게 있어야 처음 deploy.sh apply가 진행된다). 서비스(api·web)는 켜지 않는다.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
[ -s migrate/flexable_web.sql.gz ] && [ -s migrate/count-rows.txt ] && [ -s migrate/vm.env ] || { echo "migrate/에 덤프·행 수·vm.env가 없어요" >&2; exit 1; }

if [ ! -f .env ]; then
  domain="${WEB_DOMAIN:?WEB_DOMAIN=<웹 도메인>을 붙여 실행해 주세요}"
  sed "s|https://solpa\.shinhanacademy\.co\.kr|https://$domain|g" migrate/vm.env > .env
  grep -q '^WEB_SITE_URL=' .env || echo "WEB_SITE_URL=https://$domain" >> .env
  chmod 600 .env
  echo "[restore] .env 만듦(OAUTH 주소 → https://$domain)"
fi
grep -q 'solpa\.shinhanacademy' .env && { echo "[restore] .env에 옛 주소가 남아 있어요. 고친 뒤 다시 실행해 주세요" >&2; exit 1; }

docker compose up -d db
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q db)")" = "healthy" ] && break
  sleep 5
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q db)")" = "healthy" ] || { echo "[restore] db가 healthy가 되지 않았어요" >&2; exit 1; }

db() { docker compose exec -T db sh -c "MYSQL_PWD=\"\$MYSQL_PASSWORD\" exec mysql -u\"\$MYSQL_USER\" $1 \"\$MYSQL_DATABASE\""; }
tables="$(echo "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();" | db -N)"
[ "$tables" = "0" ] || { echo "[restore] EC2 웹 DB에 이미 표가 ${tables}개 있어요. 덮어쓰지 않아요(MIGRATION.md 되돌리기)" >&2; exit 1; }

echo "[restore] 복원 중"
gunzip -c migrate/flexable_web.sql.gz | db ""
db "" < count-rows.sql > migrate/count-rows-ec2.txt
if diff migrate/count-rows.txt migrate/count-rows-ec2.txt; then
  touch .restored
  echo "[restore] 행 수 같음. .restored 만듦. 다음은 MIGRATION.md 5단계(첫 배포)"
else
  echo "[restore] 행 수가 달라요(위 diff). 서비스를 켜지 말고 확인해 주세요" >&2
  exit 1
fi
