-- savings_policies: 온통청년(youthcenter) 청년정책 중 적금·저축·통장 계열 정책을 복사해 둔다. 금리가 없어 계산하지 않고 안내 정보만 보여 준다.
-- plcy_no: 정책번호(공시 키). 수집 작업이 같은 키는 갱신하고, 목록에서 사라진 정책은 지운다.
-- aply_ymd: 신청기간 원문(예: 20260401 ~ 20260630), 비어 있으면 상시·미정
CREATE TABLE savings_policies (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    plcy_no             VARCHAR(40)  NOT NULL,
    plcy_nm             VARCHAR(300) NOT NULL,
    plcy_expln_cn       TEXT         NULL,
    plcy_sprt_cn        TEXT         NULL,
    lclsf_nm            VARCHAR(100) NULL,
    mclsf_nm            VARCHAR(100) NULL,
    sprvsn_inst_nm      VARCHAR(200) NULL,
    oper_inst_nm        VARCHAR(200) NULL,
    aply_ymd            VARCHAR(60)  NULL,
    biz_prd_bgng_ymd    VARCHAR(8)   NULL,
    biz_prd_end_ymd     VARCHAR(8)   NULL,
    biz_prd_etc_cn      VARCHAR(500) NULL,
    plcy_aply_mthd_cn   TEXT         NULL,
    srng_mthd_cn        TEXT         NULL,
    sbmsn_dcmnt_cn      TEXT         NULL,
    aply_url_addr       VARCHAR(500) NULL,
    ref_url_addr        VARCHAR(500) NULL,
    etc_mttr_cn         TEXT         NULL,
    sprt_trgt_min_age   INT          NULL,
    sprt_trgt_max_age   INT          NULL,
    earn_etc_cn         TEXT         NULL,
    add_aply_qlfc_cnd_cn TEXT        NULL,
    ptcp_prp_trgt_cn    TEXT         NULL,
    last_mdfcn_dt       VARCHAR(30)  NULL,
    fetched_at          DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_savings_policies_no UNIQUE (plcy_no)
);
