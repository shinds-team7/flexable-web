# applink — [앱 연동하기]와 project2 호출의 유일한 출입구

웹 백엔드에서 project2를 부르는 코드는 **여기에만** 둔다. 다른 패키지는 이 패키지가 공개한 인터페이스와 DTO만 쓴다. 절차·API·오류 처리는 경계 문서 §5가 정본이다.

- 웹 API: `POST /api/v1/app-link { code }`(앱에서 받은 연동 코드로 연결), `GET`·`DELETE /api/v1/app-link`
- `app_links` 테이블(웹 사용자 ↔ `linkId`) 소유
- 공개 인터페이스(이름은 구현 시 확정): 연동 여부, 앱 회원 정보(이메일·닉네임), 유동자산 집계
- project2가 `404 LINK_NOT_FOUND`를 주면 연동을 끊고 저장된 앱 정보를 지운다

어댑터:
- `http/` — 운영. project2 `/internal/v1/web-links/*`를 서비스 키로 호출
- `snapshot/` — 테스트·오프라인 시연용 고정 데이터
