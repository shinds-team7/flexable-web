// 약관·개인정보처리방침 주소. 웹과 앱은 같은 운영자지만 개인정보처리방침은 각자 둔다(웹은 pages/Privacy, 앱은 앱 웹).
// 이용약관·고객지원은 아직 앱 웹(flexable-app) 것을 쓴다.

/** 앱 웹. 이용약관·고객지원과 웹 방침 시행 전의 개인정보처리방침이 있다. */
export const LEGAL_BASE = 'https://project2-flex-sh.vercel.app';

/**
 * 웹 개인정보처리방침 시행일(YYYY-MM-DD). 정해지기 전(null)에는 가입·로그인·하단 링크가 앱 방침을 가리키고,
 * /privacy는 "시행 전 초안"으로 보인다. 정할 때는 docs/product/privacy-web.md "시행 절차"를 따른다(시행 7일 전 고지).
 */
export const WEB_PRIVACY_EFFECTIVE: string | null = null;

/** 가입·로그인·하단에서 쓰는 개인정보처리방침 주소 */
export const privacyHref = WEB_PRIVACY_EFFECTIVE ? '/privacy' : `${LEGAL_BASE}/privacy`;
