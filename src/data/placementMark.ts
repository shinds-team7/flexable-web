// 진행 중인 배치고사 표시(Issue #367). 서버 응답(/me/virtual-sim/contests)으로는 배치고사를 푸는 중인지 알 수 없어,
// 배치고사를 시작하면 이 브라우저에 대회 이름과 마감 시각을 두고 제출하거나 참가가 확인되면 지운다.
// 「공시 읽는 법」(/simulation/guide)이 이 표시로 본문을 가린다. 서버로 보내지 않는다(privacy-web.md 브라우저 저장, 방침 제8조).
const KEY = 'fx.contest.placement';

type Mark = { contestId: string; expiresAt: string };

export function markPlacement(contestId: string, expiresAt: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ contestId, expiresAt } satisfies Mark)); } catch { /* 저장을 막은 브라우저는 표시 없이 동작 */ }
}

export function clearPlacement() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 마감 전인 배치고사 표시가 있으면 true. 마감이 지났거나 값이 깨졌으면 지우고 false */
export function placementInProgress(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const m = JSON.parse(raw) as Partial<Mark>;
    const until = typeof m.expiresAt === 'string' ? Date.parse(m.expiresAt) : NaN;
    if (Number.isFinite(until) && until > now) return true;
    localStorage.removeItem(KEY);
  } catch { /* 읽지 못하면 표시 없음 */ }
  return false;
}
