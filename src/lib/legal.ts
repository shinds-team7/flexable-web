// 약관·개인정보처리방침 주소. 웹과 앱은 같은 운영자지만 개인정보처리방침은 각자 둔다(웹은 pages/Privacy, 앱은 앱 웹).
// 이용약관·고객지원은 아직 앱 웹(flexable-app) 것을 쓴다.

/** 앱 웹. 이용약관·고객지원과 웹 방침 시행 전의 개인정보처리방침이 있다. */
export const LEGAL_BASE = 'https://project2-flex-sh.vercel.app';

/**
 * 웹 개인정보처리방침 시행일(YYYY-MM-DD, 한국 시간 0시). null이면 /privacy는 "시행 전 초안"이다.
 * 날짜를 넣으면 그날 전까지는 "시행 예정"으로 알리고, 그날부터 가입·로그인·하단 링크가 웹 방침으로 바뀐다(배포 없이).
 * 정할 때는 docs/product/privacy-web.md "시행 절차"를 따른다(시행 7일 전 고지).
 */
export const WEB_PRIVACY_EFFECTIVE: string | null = '2026-10-21';

/** 시행일이 지났는지(페이지를 열 때 판단) */
export const webPrivacyInEffect =
  WEB_PRIVACY_EFFECTIVE != null && Date.now() >= Date.parse(`${WEB_PRIVACY_EFFECTIVE}T00:00:00+09:00`);

/**
 * 웹 백엔드(같은 출처 /api)를 쓰는 배포인지. VITE_API_URL로 다른 서버(앱 서버)를 부르는 배포(지금 Vercel)는
 * 회원 정보를 앱 서버가 처리하므로 앱 방침을 가리킨다.
 */
export const usesWebBackend = !import.meta.env.VITE_API_URL;

/** 가입·로그인·하단에서 쓰는 개인정보처리방침 주소 */
export const privacyHref = webPrivacyInEffect && usesWebBackend ? '/privacy' : `${LEGAL_BASE}/privacy`;

/** 시행 7일 전부터 시행일 전까지 하단에 띄우는 개정 안내(웹 백엔드 배포에서만) */
export const privacyNotice = usesWebBackend && WEB_PRIVACY_EFFECTIVE != null && !webPrivacyInEffect;

/** 시행일을 "10월 28일"처럼 */
export function fmtEffective(): string {
  if (!WEB_PRIVACY_EFFECTIVE) return '미정';
  const [, m, d] = WEB_PRIVACY_EFFECTIVE.split('-').map(Number);
  return `${m}월 ${d}일`;
}

