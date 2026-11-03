-- 소식 열람 집계(요즘 많이 본 지원금). 계정과 연결하지 않는다: viewer_id는 브라우저가 만든 임의 값(UUID)이고,
-- 같은 방문자가 같은 소식을 같은 날 여러 번 열어도 한 줄이다. 30일이 지나면 지운다(news.NewsViewCleanupJob).
CREATE TABLE youth_news_view (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    news_id    BIGINT      NOT NULL,
    viewer_id  VARCHAR(36) NOT NULL,
    viewed_on  DATE        NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_youth_news_view UNIQUE (news_id, viewer_id, viewed_on)
);
CREATE INDEX idx_youth_news_view_day ON youth_news_view (viewed_on, news_id);
CREATE INDEX idx_youth_news_view_viewer ON youth_news_view (viewer_id, viewed_on);
