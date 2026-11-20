// 웹사이트 주소. 운영 주소가 아카데미 VM에서 EC2(새 도메인)로 바뀌어(docs/decisions/2026-11-20-web-on-app-ec2.md) 코드에 적지 않는다.
// 빌드 때 VITE_SITE_URL(예: https://<웹 도메인>)을 넣으면 그 값을, 없으면 지금 접속한 주소를 쓴다.
const configured = String(import.meta.env.VITE_SITE_URL ?? '').trim();

export const SITE_URL = (configured || window.location.origin).replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
