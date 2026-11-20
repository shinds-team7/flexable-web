#!/usr/bin/env bash
# GitHub Actions 배포 키 전용 명령(authorized_keys의 command=). 이 키로는 아래 세 명령만 할 수 있다.
#   plan <40자 커밋>   load(표준 입력의 gzip 이미지를 docker load)   apply <40자 커밋>
# plan·apply는 EC2 작업 폴더의 스크립트가 아니라 main에 있는 그 커밋의 deploy/ec2/deploy.sh를 실행한다.
# DEPLOY_FORCE=true를 넘기려면 명령 끝에 force를 붙인다.
set -euo pipefail
repo="${DEPLOY_DIR:-/opt/flexable-web}"
read -r cmd sha extra <<< "${SSH_ORIGINAL_COMMAND:-}"

case "$cmd" in
  load)
    gunzip | docker load
    ;;
  plan|apply)
    [[ "${sha:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "커밋은 40자 SHA여야 해요" >&2; exit 2; }
    if [ "${extra:-}" = "force" ]; then export DEPLOY_FORCE=true; fi
    git -C "$repo" fetch --quiet origin main
    git -C "$repo" merge-base --is-ancestor "$sha" origin/main || { echo "main에 없는 커밋이에요" >&2; exit 2; }
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    git -C "$repo" show "$sha:deploy/ec2/deploy.sh" > "$tmp"
    DEPLOY_DIR="$repo" bash "$tmp" "$cmd" "$sha"
    ;;
  *)
    echo "허용하지 않는 명령이에요" >&2
    exit 2
    ;;
esac
