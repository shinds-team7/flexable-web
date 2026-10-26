# 웹 DB 마이그레이션
웹 DB 전용 Flyway 이력(`V1__*.sql`부터). project2 DB와 이력을 공유하지 않는다. 적용된 파일은 고치지 않고 새 버전을 추가한다. 앱 계정은 `app_links.link_id_cipher`(암호화한 `linkId`)로만 참조하고, 앱 DB와 외래 키는 없다.

| 버전 | 내용 |
|---|---|
| `V1__web_accounts.sql` | `users`(user), `user_settings`(user), `user_credentials`(auth) |
| `V2__social_login.sql` | `user_identities`(auth), `users.email`·`user_credentials.password_hash` NULL 허용 |
| `V3__app_links.sql` | `app_links`(applink): 웹 회원당 하나, 암호화한 `linkId`, 앱에서 마지막으로 받은 회원 정보·시드머니 |
| `V4__market.sql` | `instruments`(market: 시장별 시가총액 상위 종목), `daily_prices`(market: 수정주가 일봉), `ingest_runs`(ingest: 수집 실행 기록) |
| `V5__market_events.sql` | `instruments.corp_code`(OpenDART 고유번호), `market_events`(market: 급변동 사건), `event_sources`(market: 사건 근거 공시) |
| `V6__app_link_entries.sql` | `app_links.seed_started_on`, `app_link_entries`(applink: 앱에서 받은 주기별 반영 기록, 연동과 함께 삭제) |
| `V7__privacy_notice_basis.sql` | `users.privacy_agreed_at` NULL 허용(10-21부터 가입 정보는 계약 이행 근거로 처리, 이전 동의 시각은 유지) |
| `V8__goals.sql` | `goals`(engagement: 회원당 목표 하나), `goal_coaches`(engagement: 마지막 목표 안내), `goal_coach_usage`(engagement: 회원·날짜별 AI 호출 수, 7일 뒤 삭제), `ai_daily_usage`(engagement: 회원 정보 없는 날짜별 전체 호출 수) |
| `V9__seed_money_manual.sql` | `seed_money_manual`(seedmoney: 웹에서 직접 고친 시드머니 금액·수정 시각, 회원당 하나) |
| `V10__savings.sql` | `savings_products`·`savings_rate_options`(savings): 금융감독원 finlife 적금 공시 복사본(상품·기간별 기본/최고 금리) |
| `V11__savings_policies.sql` | `savings_policies`(savings): 온통청년 청년정책 중 적금·저축·통장 계열 |
| `V12__savings_policy_region.sql` | `savings_policies.region`: 정책 지역(중앙부처는 '전국') |
| `V13__youth_news.sql` | `youth_news_raw`(news: 청년 정책 수집 원문), `youth_news`(news: 소식 카드, 검수 상태) |
| `V14__practice_datasets.sql` | `practice_datasets`(market: 사건 퀴즈 시뮬레이션용 종목별 업종·OHLC·공시 묶음. 사용자 세션·투자금·선택은 저장하지 않음) |

현재 테이블은 22개다(V1~V14). 프리셋·구독·결제·사건 설명 표는 아직 없다(03 §7은 계획 초안).

MySQL과 H2(MySQL 모드, 로컬·테스트) 양쪽에서 돌아야 한다. 테스트(`./gradlew test`)가 매번 처음부터 적용하고 `ddl-auto=validate`로 엔티티와 맞는지 본다.
