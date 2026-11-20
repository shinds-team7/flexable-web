#!/usr/bin/env bash
# 웹 VM에서 이전 자료를 꺼낸다(MIGRATION.md). VM 작업 폴더는 옛 커밋일 수 있어 main에서 받아 실행한다:
#   cd ~/flexable-web && git fetch -q origin main && git show origin/main:deploy/ec2/vm-export.sh | bash -s -- [--stop-writes] <출력 폴더>
# 출력: flexable_web.sql.gz(덤프), count-rows.txt(행 수), vm.env(.env 사본), auth-log/(읽을 수 있을 때만, 방침 제9조)
# 공개 Actions 로그에서도 쓰므로 .env 내용과 컨테이너 로그를 출력하지 않는다.
set -euo pipefail
stop=false
if [ "${1:-}" = "--stop-writes" ]; then stop=true; shift; fi
out="${1:?출력 폴더를 지정해 주세요}"
repo="${VM_DIR:-$HOME/flexable-web}"
umask 077
mkdir -p "$out/auth-log"
out="$(cd "$out" && pwd)"
cd "$repo/deploy/vm"

if [ "$stop" = "true" ]; then
  # 쓰기 멈춤: api·worker만 멈추고 db는 둔다(되돌리기: docker compose up -d, worker를 쓰던 경우 --profile worker)
  docker compose --profile worker stop api worker
  echo "[export] api·worker 멈춤"
fi

db() { docker compose exec -T db sh -c "MYSQL_PWD=\"\$MYSQL_PASSWORD\" exec $1 -u\"\$MYSQL_USER\" $2 \"\$MYSQL_DATABASE\""; }

db mysqldump "--single-transaction --no-tablespaces" | gzip > "$out/flexable_web.sql.gz"
gzip -t "$out/flexable_web.sql.gz"
zcat "$out/flexable_web.sql.gz" | tail -n 1 | grep -q 'Dump completed' || { echo "[export] 덤프가 끝까지 만들어지지 않았어요" >&2; exit 1; }
echo "[export] 덤프 $(du -h "$out/flexable_web.sql.gz" | cut -f1)"

git -C "$repo" show origin/main:deploy/ec2/count-rows.sql | db mysql "" > "$out/count-rows.txt"
echo "[export] 행 수: $(wc -l < "$out/count-rows.txt")줄 → count-rows.txt"

cp .env "$out/vm.env"
if cp /var/log/auth.log* "$out/auth-log/" 2>/dev/null; then
  echo "[export] auth.log $(ls "$out/auth-log" | wc -l)개"
else
  echo "[export] auth.log를 읽지 못했어요(권한). MIGRATION.md의 sudo 명령으로 따로 회수해 주세요"
fi
echo "[export] 완료: $out"
