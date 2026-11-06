-- 배치고사 공시 주요 내용(decisions/2026-11-05-virtual-sim-contest 2-2, policies §8-8 "공시 주요 내용"). 수집은 worker(DisclosureDetailJob)가 하고 api는 읽기만 한다.
-- OpenDART 주요사항보고서 주요정보(DS005)에서 만든 화면용 항목(비율·규모 구간, 회사·상대방 이름·날짜·절대 금액 없음)이다. 공개 자료이고 회원 정보는 없다.
-- items: [{label, value}] JSON(최대 4개, 빈 배열이면 받아 봤지만 보일 항목이 없음). version: 항목 규칙 버전(PlacementDetails.VERSION). 이전 버전 행은 다시 받는다
CREATE TABLE dart_disclosure_details (
    receipt_no   VARCHAR(14) NOT NULL,
    category     VARCHAR(20) NOT NULL,
    items        TEXT        NOT NULL,
    version      VARCHAR(20) NOT NULL,
    collected_at DATETIME(6) NOT NULL,
    PRIMARY KEY (receipt_no)
);
