-- savings_policies.region: 정책이 적용되는 지역(서울·부산·…·제주, 광주·전남). 중앙부처 정책은 '전국'.
-- 수집 작업이 주관기관·등록기관 이름과 정책거주지역코드로 정해 넣는다. 지역 필터는 선택한 지역 + '전국'을 보여 준다.
ALTER TABLE savings_policies ADD COLUMN region VARCHAR(20) NOT NULL DEFAULT '전국';
