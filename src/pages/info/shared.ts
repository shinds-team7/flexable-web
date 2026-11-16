// 두 소개 페이지가 같이 쓰는 협업 방법(두 저장소가 같은 규칙을 쓴다. docs/decisions/2026-10-25-dev-process.md).
import type { Card, Step } from './types';

export const TEAM = '임전무퇴(臨戰無退)';
export const COURSE = `신한 DS 금융SW아카데미 · ${TEAM}`;

export const COLLAB_FLOW: Step[] = [
  { title: 'Issue 하나로 시작', desc: '목표 · 참고 자료 · 범위 · 완료 조건 네 칸을 채운 Issue 하나가 작업 한 단위예요. 완료 조건은 가능하면 “어떤 테스트 통과”로 적어요.' },
  { title: '문서를 먼저 읽기', desc: 'PRD · 정책(policies.md) · API 계약(OpenAPI)을 저장소에서 직접 읽고, 작업 범위와 참고 문서를 요약한 뒤 구현해요.' },
  { title: '브랜치에서 구현', desc: '“종류-내용” 이름의 브랜치(예: feat-goal-budget-tiers)에서 화면 · 서버 · 테스트를 함께 고쳐요. 프론트는 계약에서 만든 타입과 목 서버로 백엔드를 기다리지 않아요.' },
  { title: 'PR 템플릿 채우기', desc: 'Issue 번호 · 참고한 문서 · 영향받는 파트 · 정책에 없어서 새로 내린 결정 · 검증 결과를 적어요.' },
  { title: 'CI가 규칙을 검사', desc: '빌드 · 백엔드 테스트 · 계약 테스트 · Issue 연결 · spec-change 라벨을 필수 체크로 검사해요. 하나라도 실패하면 머지할 수 없어요.' },
  { title: '리뷰 후 main 머지', desc: '공통 정책 · 계약 · 지침은 CODEOWNERS(리드)가 확인해요. main에 머지되면 자동으로 배포돼요.' },
];

export const COLLAB_RULES: Card[] = [
  { tag: '기준본', title: '저장소 문서가 유일한 기준', desc: '회의 · 메신저에서 합의한 내용도 PR로 docs/에 반영되기 전까지는 개발 기준이 아니에요. 코드와 정책 변경을 같은 PR에서 검토하고, 어떤 구현이 어느 문서 버전을 따랐는지 커밋으로 추적해요.' },
  { tag: 'spec-change', title: '문서가 바뀌면 모두가 다시 읽기', desc: '기준 문서 · 계약 · 정책을 바꾸는 PR에는 spec-change 라벨과 CHANGELOG 한 줄이 필수예요. 병합되면 각자 rebase하고 AI 세션을 새로 시작해 바뀐 문서를 다시 읽혀요.' },
  { tag: 'AI 협업', title: 'AI와 같은 지침으로 일하기', desc: 'AGENTS.md(Claude는 CLAUDE.md로 참조)에 “무엇을 읽고 어떻게 작업할지”만 짧게 적어, 팀원 각자의 AI 세션이 같은 문서 · 같은 검증 명령을 따르게 했어요.' },
  { tag: '결정 기록', title: '개발 중 결정도 문서로', desc: '작은 결정은 PR의 “새로 내린 결정” 칸에, 다른 파트에 영향을 주는 결정은 docs/decisions/에 날짜별로 남겨 코드와 문서가 어긋나지 않게 해요.' },
  { tag: '계약 우선', title: 'API는 OpenAPI로 먼저 합의', desc: '응답 형식을 OpenAPI yaml로 먼저 정하고, 백엔드는 계약 테스트로 · 프론트는 생성 타입과 목 서버로 동시에 개발해요.' },
  { tag: '인수인계', title: 'HANDOFF로 진행 상황 공유', desc: '진행 · 배포 · 운영 확인 결과는 HANDOFF.md 하나에 모아, 누가 이어받아도 지금 상태와 남은 일을 바로 알 수 있게 해요.' },
];
