#!/bin/sh
# 웹 DB 백업: deploy/vm/backups/에 날짜별 덤프를 만들고 KEEP_DAYS(기본 7)일 지난 것을 지운다.
# cron 예: 0 4 * * * /home/student/flexable-web/deploy/vm/backup.sh >> /home/student/flexable-web/deploy/vm/backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p backups
chmod 700 backups
out="backups/flexable_web-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" --single-transaction --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$out"
chmod 600 "$out"
find backups -name 'flexable_web-*.sql.gz' -mtime +"${KEEP_DAYS:-7}" -delete
echo "$(date '+%F %T') $out"
