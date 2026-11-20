export const SERVICE_NAME = "텅장관리";
// 시연은 웹과 같은 주소의 /m에서 열리므로 접속한 주소가 웹 주소다(웹 도메인 변경, flexable-web docs/decisions/2026-11-20-web-on-app-ec2.md)
export const WEBSITE_URL: string = globalThis.location?.origin ?? "";
export const WEBSITE_HOST = WEBSITE_URL.replace(/^https?:\/\//, "");
export const OPERATOR_NAME = "ucmnuniverse";
export const SUPPORT_EMAIL = "ucmnuniverse@gmail.com";
/** 시연 화면이 옮겨 온 실제 앱 버전(flexable-app frontend/app.json). 시연 자체 버전은 src/demo/version.ts */
export const APP_VERSION = "1.6.0";
