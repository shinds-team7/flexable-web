#!/usr/bin/env bash
# 웹 EC2 배포. .github/workflows/deploy-ec2.yml이 SSH(ssh-entry.sh)로 실행한다. 사람이 EC2에서 직접 실행해도 같다.
#   deploy.sh plan  <커밋>  배포가 필요한지 key=value로 출력한다. 서비스는 건드리지 않는다.
#   deploy.sh apply <커밋>  백업 확인 → ff-only 반영 → Actions가 넣은 이미지로 교체 → health 확인
# 이미지는 Actions가 만들어 `flexable-web-backend:<커밋>`·`flexable-web-web:<커밋>`으로 넣는다(EC2 2GB에서 빌드하지 않음).
# 처음 한 번은 MIGRATION.md대로 DB를 복원하고 .restored를 만든 뒤에만 apply가 진행된다(빈 DB에 Flyway가 새 표를 만들지 않게).
# 공개 저장소의 Actions 로그에 남으므로 컨테이너 로그와 환경변수를 출력하지 않는다.
set -euo pipefail

mode="${1:-}"
target="${2:-}"
repo="${DEPLOY_DIR:-/opt/flexable-web}"
force="${DEPLOY_FORCE:-false}"
migration_dir="backend/src/main/resources/db/migration"
images=(flexable-web-backend flexable-web-web)

log() { echo "[deploy] $*" >&2; }
die() { echo "[deploy] 중단: $*" >&2; exit 1; }

case "$mode" in plan|apply) ;; *) die "사용법: deploy.sh plan|apply <커밋>" ;; esac
[ -n "$target" ] || die "커밋을 지정해 주세요"

cd "$repo"
# 사람이 EC2에서 직접 실행해도 Actions 배포와 겹치지 않게 잠근다.
exec 9> "$repo/.git/deploy.lock"
flock -n 9 || die "다른 배포가 진행 중이에요"
# 마지막으로 배포에 성공한 커밋. 없으면 아직 처음 배포 전이다.
state="$repo/.git/deployed-sha"

git fetch --quiet origin main
full="$(git rev-parse --verify "${target}^{commit}")"
git merge-base --is-ancestor "$full" origin/main || die "$full 은 main에 있는 커밋이 아니에요"

plan() {
  local deploy=true migration=false reason="변경 있음" base
  if [ ! -f "$state" ]; then
    # 처음 배포: 복원한 DB가 이 커밋의 마이그레이션을 받을 수 있으니 승인을 거친다.
    reason="처음 배포"
    migration=true
  else
    base="$(cat "$state")"
    if [ "$full" != "$base" ] && git merge-base --is-ancestor "$full" "$base"; then
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
  fi
  log "대상 ${full:0:7}: $reason (마이그레이션: $migration)"
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
    body="$(curl -fsS --max-time 5 http://127.0.0.1:8081/api/v1/health 2>/dev/null || true)"
    case "$body" in *'"status":"UP"'*) return 0 ;; esac
    sleep 5
  done
  return 1
}

apply() {
  [ "$(git symbolic-ref --short HEAD)" = "main" ] || die "EC2 작업 폴더가 main 브랜치가 아니에요"
  [ -z "$(git -c core.fileMode=false status --porcelain)" ] || die "EC2 작업 폴더에 커밋되지 않은 변경이 있어요"
  [ -f "$state" ] || [ -f "$repo/deploy/ec2/.restored" ] || die "처음 배포 전이에요. MIGRATION.md대로 DB를 복원하고 deploy/ec2/.restored를 만든 뒤 다시 실행해 주세요"
  local img
  for img in "${images[@]}"; do
    docker image inspect "$img:$full" > /dev/null 2>&1 || die "이미지 $img:${full:0:7}가 없어요(Actions의 build·load 단계 확인)"
  done

  cd "$repo/deploy/ec2"
  log "백업"
  backup

  log "코드 반영 ${full:0:7}"
  git -c core.fileMode=false merge --ff-only --quiet "$full"
  [ "$(git rev-parse HEAD)" = "$full" ] || die "EC2 커밋이 대상과 달라요"

  # :good는 마지막으로 health까지 성공한 이미지, :previous는 그 전 성공 이미지다. 실패한 배포는 둘 다 바꾸지 않는다(README "되돌리기").
  for img in "${images[@]}"; do
    docker tag "$img:$full" "$img:latest"
  done

  log "재시작(DB 마이그레이션은 api가 켜질 때 적용, worker는 켜져 있을 때만 함께)"
  local profile=()
  if [ -n "$(docker compose --profile worker ps --status running -q worker)" ]; then
    profile=(--profile worker)
  fi
  docker compose "${profile[@]}" up -d --no-build

  log "health 확인"
  wait_health || die "health가 UP이 되지 않았어요. 자동으로 되돌리지 않아요. EC2에서 확인해 주세요(백업: $backup_file, 마지막 성공 이미지: :good)"

  for img in "${images[@]}"; do
    if docker image inspect "$img:good" > /dev/null 2>&1; then docker tag "$img:good" "$img:previous"; fi
    docker tag "$img:$full" "$img:good"
  done

  printf '%s\n' "$full" > "$state"
  rm -f "$repo/deploy/ec2/.restored"
  # latest·good·previous가 아닌 커밋 태그를 지워 디스크를 아낀다(태그만 지우고 다른 태그가 가리키는 이미지는 남는다).
  for img in "${images[@]}"; do
    docker images "$img" --format '{{.Tag}}' | grep -Ev '^(latest|good|previous)$' | sed "s|^|$img:|" | xargs -r docker rmi > /dev/null 2>&1 || true
  done
  docker image prune -f > /dev/null
  log "완료 ${full:0:7}"
}

"$mode"
