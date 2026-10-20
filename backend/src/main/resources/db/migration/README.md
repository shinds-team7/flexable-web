# 웹 DB 마이그레이션
웹 DB 전용 Flyway 이력(`V1__*.sql`부터). project2 DB와 이력을 공유하지 않는다. 적용된 파일은 고치지 않고 새 버전을 추가한다. 앱 계정은 `app_links.link_id`로만 참조하고, 앱 DB와 외래 키는 없다.
