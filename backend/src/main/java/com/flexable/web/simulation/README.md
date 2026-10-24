# simulation
투자 시뮬레이션 계산(`SimulationEngine`, 순수 함수)과 `POST /api/v1/simulations/run`(`SimulationController`·`SimulationService`, 공개 API). 시세·사건은 `market`의 공개 서비스로 읽기만 한다. 원 단위 정수, 나눗셈 내림. 응답에는 과거 계산 고지(`SIM_PAST`)를 붙인다.

계산 규칙·요청·응답은 `backend/README.md` "API"가 정본이다. 적금 비교·섞어보기 계산과 프리셋 저장은 아직 없다(의존 표의 `savings`·`seedmoney`는 그때를 위해 허용해 둔 방향이고, 지금 코드는 `market`·`common`만 쓴다).
