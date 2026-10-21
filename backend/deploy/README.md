# backend/deploy
웹 백엔드 이미지(`Dockerfile`, 빌드 컨텍스트 `backend/`). api와 worker(`SPRING_PROFILES_ACTIVE=worker`)가 같은 이미지를 쓴다. 비밀 값은 넣지 않고 실행할 때 환경변수로 받는다. VM 실행 구성은 저장소 루트 [`deploy/vm/`](../../deploy/vm/README.md).
