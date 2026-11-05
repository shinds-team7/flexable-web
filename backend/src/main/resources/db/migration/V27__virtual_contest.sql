-- 가상 시뮬레이션 대회(decisions/2026-11-05-virtual-sim-contest, policies §8-8). 회원과 연결한 대회 기록이다.
-- 지난 대회는 끝난 뒤 12개월이 지나면 정리 작업(VirtualContestJob)이 대회 행을 지워 함께 지우고, 탈퇴하면 회원 행과 함께 지운다(ON DELETE CASCADE).
-- 진행 중인 판·배치고사의 시드·가상 종목·제출한 매매·문제는 정산·채점하면 NULL로 지우고 결과만 남긴다(결정 기록 5-3).

-- 대회(시즌). id는 대회 이름 YYYY-MM. 기간은 그달 1일 00:00 ~ 다음 달 1일 00:00(KST, 저장은 UTC)
CREATE TABLE virtual_contests (
    id         VARCHAR(7)  NOT NULL,
    starts_at  DATETIME(6) NOT NULL,
    ends_at    DATETIME(6) NOT NULL,
    status     VARCHAR(10) NOT NULL,
    settled_at DATETIME(6) NULL,
    PRIMARY KEY (id)
);

-- 서버가 붙인 익명 별명(vsim-alias-v1). 회원이 바꿀 수 없고 탈퇴할 때까지 같다
CREATE TABLE virtual_contest_aliases (
    user_id    BIGINT      NOT NULL,
    alias      VARCHAR(30) NOT NULL,
    version    VARCHAR(20) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT uk_virtual_contest_aliases UNIQUE (alias),
    CONSTRAINT fk_virtual_contest_aliases_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 배치고사(시즌마다 한 번). questions: 채점 전 문제 사본(회사·유형·글·경향·통계 JSON, 채점하면 지움). result: 문제별 답·경향·통계 JSON
CREATE TABLE virtual_contest_placements (
    id         VARCHAR(36) NOT NULL,
    contest_id VARCHAR(7)  NOT NULL,
    user_id    BIGINT      NOT NULL,
    questions  TEXT        NULL,
    result     TEXT        NULL,
    correct    INT         NULL,
    board      VARCHAR(6)  NULL,
    started_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    graded_at  DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_virtual_contest_placements UNIQUE (contest_id, user_id),
    CONSTRAINT fk_virtual_contest_placements_contest FOREIGN KEY (contest_id) REFERENCES virtual_contests (id) ON DELETE CASCADE,
    CONSTRAINT fk_virtual_contest_placements_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 참가(배치고사를 마친 회원). balance: 지금 대회 잔액(진행 중인 판은 시작 잔액), board_points: 지금 판에 들어온 뒤 하루 점수 합,
-- reached_at: 지금 잔액이 된 시각(판이 없으면 참가 시각), scored_through: 하루 점수를 정한 마지막 날, change_*: 마지막 승급·강등,
-- final_*: 정산 때 확정한 마지막 판 안 순위·참가자 수
CREATE TABLE virtual_contest_entries (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    contest_id         VARCHAR(7)  NOT NULL,
    user_id            BIGINT      NOT NULL,
    placement_correct  INT         NOT NULL,
    placement_board    VARCHAR(6)  NOT NULL,
    board              VARCHAR(6)  NOT NULL,
    highest_board      VARCHAR(6)  NOT NULL,
    balance            BIGINT      NOT NULL,
    board_points       INT         NOT NULL DEFAULT 0,
    rounds             INT         NOT NULL DEFAULT 0,
    liquidated         BOOLEAN     NOT NULL DEFAULT FALSE,
    reached_at         DATETIME(6) NOT NULL,
    joined_at          DATETIME(6) NOT NULL,
    scored_through     DATE        NULL,
    change_from        VARCHAR(6)  NULL,
    change_to          VARCHAR(6)  NULL,
    change_points      INT         NULL,
    changed_at         DATETIME(6) NULL,
    final_rank         INT         NULL,
    final_participants INT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_virtual_contest_entries UNIQUE (contest_id, user_id),
    CONSTRAINT fk_virtual_contest_entries_contest FOREIGN KEY (contest_id) REFERENCES virtual_contests (id) ON DELETE CASCADE,
    CONSTRAINT fk_virtual_contest_entries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX idx_virtual_contest_entries_board ON virtual_contest_entries (contest_id, board);
CREATE INDEX idx_virtual_contest_entries_user ON virtual_contest_entries (user_id);

-- 하루 점수(날마다 한 번). 그날 판이 없으면 잔액·수익률은 NULL이고 점수 0
CREATE TABLE virtual_contest_days (
    entry_id      BIGINT        NOT NULL,
    on_date       DATE          NOT NULL,
    board         VARCHAR(6)    NOT NULL,
    start_balance BIGINT        NULL,
    end_balance   BIGINT        NULL,
    return_rate   DECIMAL(12,4) NULL,
    points        INT           NOT NULL,
    decided_at    DATETIME(6)   NOT NULL,
    PRIMARY KEY (entry_id, on_date),
    CONSTRAINT fk_virtual_contest_days_entry FOREIGN KEY (entry_id) REFERENCES virtual_contest_entries (id) ON DELETE CASCADE
);

-- 주간 판정(주마다 한 번). to_board가 from_board와 다르면 승급·강등
CREATE TABLE virtual_contest_weeks (
    entry_id   BIGINT      NOT NULL,
    week       INT         NOT NULL,
    points     INT         NOT NULL,
    from_board VARCHAR(6)  NOT NULL,
    to_board   VARCHAR(6)  NOT NULL,
    decided_at DATETIME(6) NOT NULL,
    PRIMARY KEY (entry_id, week),
    CONSTRAINT fk_virtual_contest_weeks_entry FOREIGN KEY (entry_id) REFERENCES virtual_contest_entries (id) ON DELETE CASCADE
);

-- 판(가상 시뮬레이션 한 번). on_date: 판을 시작한 KST 날짜(하루 판 수·하루 점수·생성기 세션 날짜). status ACTIVE | SETTLED,
-- end_reason COMPLETED | ENDED | EXPIRED | RESTARTED | REPLACED | CLOSED. seed~orders는 진행 중에만 두고 정산하면 지운다.
-- ruleset_id NULL은 예시 룰셋(VIRTUAL_SIM_SOURCE=fake), categories는 시작할 때 그 회사의 공개 가능 유형, orders는 제출한 매매 JSON
CREATE TABLE virtual_contest_rounds (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    entry_id      BIGINT       NOT NULL,
    start_id      VARCHAR(36)  NOT NULL,
    round_number  INT          NOT NULL,
    board         VARCHAR(6)   NOT NULL,
    generator     VARCHAR(20)  NOT NULL,
    on_date       DATE         NOT NULL,
    start_balance BIGINT       NOT NULL,
    end_balance   BIGINT       NULL,
    started_at    DATETIME(6)  NOT NULL,
    expires_at    DATETIME(6)  NOT NULL,
    ended_at      DATETIME(6)  NULL,
    status        VARCHAR(10)  NOT NULL,
    end_reason    VARCHAR(12)  NULL,
    seed          BIGINT       NULL,
    ruleset_id    BIGINT       NULL,
    company_id    BIGINT       NULL,
    categories    VARCHAR(400) NULL,
    orders        TEXT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_virtual_contest_rounds UNIQUE (entry_id, start_id),
    CONSTRAINT fk_virtual_contest_rounds_entry FOREIGN KEY (entry_id) REFERENCES virtual_contest_entries (id) ON DELETE CASCADE
);
CREATE INDEX idx_virtual_contest_rounds_day ON virtual_contest_rounds (entry_id, on_date);
CREATE INDEX idx_virtual_contest_rounds_status ON virtual_contest_rounds (status);
