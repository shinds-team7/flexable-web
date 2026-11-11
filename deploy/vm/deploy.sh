#!/usr/bin/env bash
# 웹 VM 배포. .github/workflows/deploy.yml이 VM 러너에서 실행한다(사람이 직접 실행해도 같다).
#   deploy.sh plan  <커밋>  배포가 필요한지 key=value로 출력한다. 서비스는 건드리지 않는다.
#   deploy.sh apply <커밋>  백업 확인 → ff-only 반영 → api·web 순차 빌드 → 재시작 → health 확인
# DEPLOY_FORCE=true면 바뀐 내용이 없어도 다시 빌드·재시작한다.
# 공개 저장소의 Actions 로그에 남으므로 컨테이너 로그와 환경변수를 출력하지 않는다.
set -euo pipefail

mode="${1:-}"
target="${2:-}"
repo="${DEPLOY_DIR:-$HOME/flexable-web}"
force="${DEPLOY_FORCE:-false}"
migration_dir="backend/src/main/resources/db/migration"

log() { echo "[deploy] $*" >&2; }
die() { echo "[deploy] 중단: $*" >&2; exit 1; }

case "$mode" in plan|apply) ;; *) die "사용법: deploy.sh plan|apply <커밋>" ;; esac
[ -n "$target" ] || die "커밋을 지정해 주세요"

cd "$repo"
# 마지막으로 배포에 성공한 커밋. 빌드가 실패해 HEAD만 앞서가도 재시도 때 변경을 놓치지 않는다.
state="$repo/.git/deployed-sha"

git fetch --quiet origin main
full="$(git rev-parse --verify "${target}^{commit}")"
git merge-base --is-ancestor "$full" origin/main || die "$full 은 main에 있는 커밋이 아니에요"

if [ -f "$state" ]; then
  base="$(cat "$state")"
else
  base="$(git rev-parse HEAD)"
fi

plan() {
  local deploy=true migration=false reason="변경 있음"

  if [ "$full" != "$base" ] && git merge-base --is-ancestor "$full" "$base"; then
    # 더 새로운 커밋이 이미 배포됐다. 되돌리기는 자동 배포가 하지 않는다.
    deploy=false
    reason="이미 더 새로운 커밋이 배포됨"
  elif [ "$force" != "true" ]; then
    if [ "$full" = "$base" ]; then
      deploy=false
      reason="이미 배포된 커밋"
    elif [ -z "$(git diff --name-only "$base" "$full" | grep -Ev '^(docs|tests|postman|\.github)/|\.md$' || true)" ]; then
      deploy=false
      reason="서비스에 영향 없는 변경만 있음"
    fi
  fi

  if [ "$deploy" = "true" ] && [ -n "$(git diff --name-only --diff-filter=ACMR "$base" "$full" -- "$migration_dir")" ]; then
    migration=true
  fi

  log "기준 ${base:0:7} → 대상 ${full:0:7}: $reason (마이그레이션: $migration)"
  echo "deploy=$deploy"
  echo "migration=$migration"
}

# backup.sh는 파이프 끝의 gzip 결과만 보므로 덤프가 실패해도 성공으로 끝날 수 있다. 파일 내용까지 확인한다.
backup() {
  local out
  out="$(bash ./backup.sh | tail -n 1 | awk '{print $NF}')"
  [ -s "$out" ] || die "백업 파일이 없거나 비어 있어요"
  gzip -t "$out" || die "백업 파일이 손상됐어요: $out"
  [ "$(zcat "$out" | grep -c 'CREATE TABLE')" -gt 0 ] || die "백업에 테이블이 없어요: $out"
  zcat "$out" | tail -n 1 | grep -q 'Dump completed' || die "백업이 끝까지 만들어지지 않았어요: $out"
  log "백업 확인: $out"
  backup_file="$out"
}

wait_health() {
  local body
  for _ in $(seq 1 60); do
    body="$(curl -fsS --max-time 5 http://localhost/api/v1/health 2>/dev/null || true)"
    case "$body" in *'"status":"UP"'*) return 0 ;; esac
    sleep 5
  done
  return 1
}

apply() {
  [ "$(git symbolic-ref --short HEAD)" = "main" ] || die "VM 작업 폴더가 main 브랜치가 아니에요"
  # README대로 chmod +x 한 스크립트의 권한 변경은 변경으로 치지 않는다.
  [ -z "$(git -c core.fileMode=false status --porcelain)" ] || die "VM 작업 폴더에 커밋되지 않은 변경이 있어요"
  [ -f "$state" ] || git rev-parse HEAD > "$state"

  log "백업"
  cd "$repo/deploy/vm"
  backup

  log "코드 반영 ${full:0:7}"
  git -c core.fileMode=false merge --ff-only --quiet "$full"
  [ "$(git rev-parse HEAD)" = "$full" ] || die "VM 커밋이 대상과 달라요"

  # 1코어라 동시에 빌드하지 않는다. 여기서 실패하면 실행 중인 서비스는 그대로다.
  log "api 빌드"
  docker compose build api
  log "web 빌드"
  docker compose build web

  local profile=()
  if [ -n "$(docker compose --profile worker ps --status running -q worker)" ]; then
    profile=(--profile worker)
  fi

  log "재시작(DB 마이그레이션은 api가 켜질 때 적용)"
  docker compose "${profile[@]}" up -d --no-build

  log "health 확인"
  wait_health || die "health가 UP이 되지 않았어요. 자동으로 되돌리지 않아요. VM에서 확인해 주세요(백업: $backup_file)"

  printf '%s\n' "$full" > "$state"
  docker image prune -f > /dev/null
  log "완료 ${full:0:7}"
}

"$mode"
