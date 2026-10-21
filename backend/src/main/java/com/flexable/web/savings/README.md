# savings
적금 상품과 금리, 조회·계산 API, 청년정책(적금·저축·통장 계열) 조회. 청년미래적금 계산 카드는 아직 예시 값이다.

- 데이터: 금융감독원 금융상품한눈에(finlife) 적금 공시를 `ingest`가 받아 `savings_products`·`savings_rate_options`(V4)에 저장한다. 화면 API는 이 로컬 DB만 읽는다.
- 쓰기 출입구는 `SavingsCatalogService.replaceAll`(전체 스냅숏 교체: 같은 키 갱신, 사라진 상품 삭제, 빈 목록은 거부).
- 계산은 `SavingsCalculator`(순수 함수, 원 단위 내림, 세금 floor(세전 이자 × 15.4%)). 기준 예: 월 78,000원 × 12개월 연 3.5% 단리 → 세후 이자 15,010원.
- 우대조건은 계산에 넣지 않는다. 최고금리(`intr_rate2`)는 우대를 모두 채운 가정의 참고 값이다.
