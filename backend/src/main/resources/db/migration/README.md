# 웹 DB 마이그레이션
웹 DB 전용 Flyway 이력(`V1__*.sql`부터). project2 DB와 이력을 공유하지 않는다. 적용된 파일은 고치지 않고 새 버전을 추가한다. 앱 계정은 `app_links.link_id`로만 참조하고, 앱 DB와 외래 키는 없다.

| 버전 | 내용 |
|---|---|
| `V1__web_accounts.sql` | `users`(user), `user_settings`(user), `user_credentials`(auth) |
| `V2__social_login.sql` | `user_identities`(auth), `users.email`·`user_credentials.password_hash` NULL 허용 |

MySQL과 H2(MySQL 모드, 로컬·테스트) 양쪽에서 돌아야 한다. 테스트(`./gradlew test`)가 매번 처음부터 적용하고 `ddl-auto=validate`로 엔티티와 맞는지 본다.
