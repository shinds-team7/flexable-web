#!/bin/sh
# 웹 접속·오류 기록을 시간 기준으로 지운다(웹 개인정보처리방침 제4조: 기록 시점부터 최대 7일).
# 이 프로젝트(flexable-web) 컨테이너의 Docker 로그 파일을 비우고 회전된 옛 파일을 지운다. 용량 제한(10MB × 5)은 docker-compose.yml.
# Docker 로그 파일은 root 소유라 root crontab에 매주 한 번 등록한다(sudo crontab -e):
#   0 4 * * 0 /home/student/flexable-web/deploy/vm/purge-logs.sh >> /var/log/flexable-purge-logs.log 2>&1
set -eu
ids=$(docker ps -aq --filter label=com.docker.compose.project=flexable-web)
for id in $ids; do
	path=$(docker inspect --format '{{.LogPath}}' "$id")
	[ -n "$path" ] || continue
	truncate -s 0 "$path"
	rm -f "$path".*
done
echo "$(date '+%F %T') purged $(echo "$ids" | wc -w) containers"
