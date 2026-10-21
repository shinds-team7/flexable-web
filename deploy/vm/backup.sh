#!/bin/sh
# 웹 DB 백업: deploy/vm/backups/에 날짜별 덤프를 만들고, 만든 지 KEEP_DAYS(기본 7)일이 된 것을 지운다.
# 매일 같은 시각에 돌면 각 백업은 만든 때부터 최대 KEEP_DAYS일 남는다(웹 개인정보처리방침 제4조). 실행 시각이 조금 밀려도
# 7일째 실행에서 지워지도록 1시간 여유를 두고 분 단위로 계산한다(find -mtime +7은 8일째에야 지워 쓰지 않음).
# cron 예: 0 4 * * * /home/student/flexable-web/deploy/vm/backup.sh >> /home/student/flexable-web/deploy/vm/backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p backups
chmod 700 backups
out="backups/flexable_web-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" --single-transaction --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$out"
chmod 600 "$out"
keep_min=$(( ${KEEP_DAYS:-7} * 1440 - 60 ))
find backups -name 'flexable_web-*.sql.gz' -mmin +"$keep_min" -delete
echo "$(date '+%F %T') $out"
