-- savings: finlife 금융회사 공시(companySearch.json, 은행 020000·저축은행 030300)의 홈페이지 주소(Issue #449).
-- 적금·정기예금 상품 상세의 "○○ 홈페이지" 링크에만 쓴다. 상품 가입 페이지가 아니다(01 R2 가입 버튼 없음).
-- 키: fin_co_no(상품 표의 fin_co_no와 같은 값). 수집 작업이 같은 키는 갱신하고 공시에서 사라진 회사는 지운다.
-- homepage_url: http·https 주소만. 공시에 없거나 형식이 다르면 NULL
CREATE TABLE finlife_companies (
    fin_co_no    VARCHAR(20)  NOT NULL,
    kor_co_nm    VARCHAR(100) NOT NULL,
    homepage_url VARCHAR(300) NULL,
    fetched_at   DATETIME(6)  NOT NULL,
    PRIMARY KEY (fin_co_no)
);
