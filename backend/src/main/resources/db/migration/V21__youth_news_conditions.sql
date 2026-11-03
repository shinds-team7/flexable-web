-- news: 소식 신청 대상 조건(온통청년 jobCd·mrgSttsCd·schoolCd·plcyMajorCd·sbizCd를 이름으로 바꾼 것). 30초 진단이 맞춰 본다.
-- NULL = 원문에서 확인 못 함, 'ANY' = 제한 없음, 그 밖에는 쉼표로 이은 이름. 다음 수집(06:00)에서 채워진다
ALTER TABLE youth_news ADD COLUMN job_conds VARCHAR(120) NULL;
ALTER TABLE youth_news ADD COLUMN marital_conds VARCHAR(30) NULL;
ALTER TABLE youth_news ADD COLUMN school_conds VARCHAR(120) NULL;
ALTER TABLE youth_news ADD COLUMN major_conds VARCHAR(120) NULL;
ALTER TABLE youth_news ADD COLUMN special_conds VARCHAR(120) NULL;
