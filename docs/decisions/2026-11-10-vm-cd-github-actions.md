# 웹 VM 자동 배포: GitHub Actions + VM 러너

- 날짜: 2026-11-10 · 결정한 사람: 배포 담당(채팅에서 Jenkins 대신 GitHub Actions, VM 러너 설치로 결정) · 상태: **승인, 구현(러너 설치·실제 배포 확인 전)**
- 이슈: [#386](https://github.com/shinds-team7/flexable-web/issues/386)
- 영향: 웹 VM 배포 절차(프론트·백엔드 공통). `ci.yml`·Vercel 배포·앱 서버·서버 `.env`는 바뀌지 않는다. 개인정보 처리 항목 변화 없음.

## 결정

1. **CI와 같은 GitHub Actions로 배포한다.** `ci.yml`은 그대로 두고 `.github/workflows/deploy.yml`을 더한다. Jenkins는 쓰지 않는다.
2. **배포 대상은 웹 VM이다.** VM은 회사 망 밖에서 SSH로 접속할 수 없어 GitHub 호스팅 러너가 닿지 못한다. VM에 셀프 호스티드 러너(라벨 `flexable-vm`)를 설치하고, VM에서 GitHub로 나가는 연결만 쓴다.
3. **실행 조건**: `main`의 CI 성공(`workflow_run`, push 이벤트, 이 저장소의 커밋만) 또는 `main`에서 수동 실행(CI 성공 기록 필요). 동시 배포는 하지 않는다.
4. **순서**(`deploy/vm/deploy.sh`): 백업 → 백업 파일 검사 → ff-only 반영 → api·web 순차 빌드 → `--no-build` 재시작 → health 확인. 백업 검사나 health가 실패하면 실패로 끝난다. worker는 실행 중일 때만 함께 재시작한다.
5. **건너뛰기**: 마지막 배포 성공 커밋부터의 변경이 `docs/`·`tests/`·`postman/`·`.github/`·`*.md`뿐이면 배포하지 않는다.
6. **마이그레이션 승인**: 새 Flyway 파일이 있으면 GitHub Environment `production-migration`의 승인자가 승인한 뒤에만 진행한다. 그 외는 `production`으로 자동 진행한다.
7. **자동으로 되돌리지 않는다.** Flyway 변경을 안전하게 되돌릴 수 없어, 실패 시 멈추고 사람이 백업과 커밋을 보고 판단한다.

## 공개 저장소 주의

- VM 러너에서는 `main`에 들어간 커밋의 스크립트만 실행한다.
- 저장소 설정에서 외부 기여자의 fork PR 워크플로에 승인을 요구한다. 쓰기 권한이 있는 팀원의 브랜치에는 적용되지 않는 설정이다.
- Actions 로그는 공개되므로 컨테이너 로그와 환경변수를 출력하지 않는다.

## 남은 확인

- 사람: VM 러너 설치, Environment 2개 생성과 승인자 지정, fork PR 승인 설정, 첫 실제 배포 확인.
- worker를 다시 만들면 시세 수집이 켜질 때 한 번 돈다(`MARKET_SYNC_ON_START`). 백엔드가 바뀐 배포마다 외부 API 호출이 늘어나는지 운영에서 본다.
- 러너 실행은 `auth.log`의 SSH·sudo 기록에 남지 않고 Actions 실행 이력에 남는다. 관리자 접근 기록(방침 제9조) 범위에 넣을지 담당자가 확인한다.
- `README.md`의 11-18 VM 종료·AWS 이전 일정은 이번에 바꾸지 않았다. 서버를 옮기면 그 서버에 러너를 다시 설치한다.
