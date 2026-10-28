package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flexable.web.market.EventDtos.EventNews;
import com.flexable.web.market.NewsSearch.Article;
import com.flexable.web.market.NewsSearch.Sort;

/**
 * 사건 무렵 뉴스(decisions/2026-10-28-event-news): 발행일 거르기(사건 시작 3일 전~마지막 날 3일 뒤, KST)·중복·최대 5건,
 * 키 없음·실패면 UNAVAILABLE, 429면 그날 멈춤, 하루 상한, 최근 사건만 날짜순 검색.
 */
class EventNewsServiceTest {

	static final ZoneOffset KST = ZoneOffset.ofHours(9);
	/** 2026-10-28 10:00 KST */
	static final Instant NOW = Instant.parse("2026-10-28T01:00:00Z");

	MarketEventRepository events = mock(MarketEventRepository.class);
	InstrumentRepository instruments = mock(InstrumentRepository.class);
	StubSearch search = new StubSearch();
	MovingClock clock = new MovingClock(NOW);

	@BeforeEach
	void setup() {
		Instrument inst = mock(Instrument.class);
		when(inst.getName()).thenReturn("삼성전자");
		when(instruments.findById(7L)).thenReturn(Optional.of(inst));
		event(1L, MarketEvent.STOCK, LocalDate.of(2026, 3, 10), LocalDate.of(2026, 3, 12), "RISE");
	}

	private void event(long id, String scope, LocalDate start, LocalDate end, String direction) {
		MarketEvent e = new MarketEvent(7L, scope, EventDetector.VERSION);
		e.apply(new EventDetector.Detected(start, end, 3, direction, 0.1, 0.01, 3.0, 2.0, 1.0, 1), NOW);
		when(events.findById(id)).thenReturn(Optional.of(e));
	}

	private EventNewsService service(int cap) {
		return new EventNewsService(events, instruments, search, clock, cap);
	}

	private static Article at(String title, String url, String kstDateTime) {
		return new Article(title, url, "news.example.com", OffsetDateTime.parse(kstDateTime + "+09:00"));
	}

	@Test
	void 사건_앞뒤_3일_밖의_기사는_빼고_발행순으로_최대_5건() {
		search.answer = q -> List.of(
				at("하루 전 넘어 경계 밖", "https://a.example.com/0", "2026-03-06T23:59:00"),
				at("시작 3일 전 0시", "https://a.example.com/1", "2026-03-07T00:00:00"),
				at("사건 중", "https://a.example.com/2", "2026-03-11T15:40:00"),
				at("마지막 날 3일 뒤 밤", "https://a.example.com/3", "2026-03-15T23:59:00"),
				at("경계 밖", "https://a.example.com/4", "2026-03-16T00:00:00"),
				// UTC로는 3-15이지만 KST로는 3-16이라 빠진다
				new Article("KST로 다음 날", "https://a.example.com/5", null, OffsetDateTime.parse("2026-03-15T15:30:00Z")));
		EventNews news = service(100).news(1L).orElseThrow();
		assertThat(news.status()).isEqualTo("OK");
		assertThat(news.from()).isEqualTo(LocalDate.of(2026, 3, 7));
		assertThat(news.to()).isEqualTo(LocalDate.of(2026, 3, 15));
		assertThat(news.items()).extracting(EventDtos.NewsItem::title).containsExactly("시작 3일 전 0시", "사건 중", "마지막 날 3일 뒤 밤");
		assertThat(news.items()).allSatisfy(i -> assertThat(i.publishedAt().getOffset()).isEqualTo(KST));
		assertThat(news.isSample()).isFalse();
		assertThat(news.sourceName()).isEqualTo("네이버 뉴스 검색");
		// 지난 사건(30일 넘음)은 정확도순 두 번만, 날짜순은 부르지 않는다
		assertThat(search.queries).containsExactly("삼성전자 급등/SIM", "삼성전자 주가/SIM");
	}

	@Test
	void 같은_원문_링크는_한_번만_5건을_넘지_않는다() {
		List<Article> many = new ArrayList<>();
		for (int i = 0; i < 8; i++) {
			many.add(at("기사 " + i, "https://a.example.com/" + i, "2026-03-1" + (i % 3) + "T09:00:00"));
		}
		many.addFirst(at("같은 기사 다른 제목", "https://a.example.com/0", "2026-03-07T08:00:00"));
		search.answer = q -> many;
		EventNews news = service(100).news(1L).orElseThrow();
		assertThat(news.items()).hasSize(5);
		assertThat(news.items()).extracting(EventDtos.NewsItem::url).doesNotHaveDuplicates();
		assertThat(news.items().getFirst().title()).isEqualTo("같은 기사 다른 제목"); // 먼저 받은 것을 남긴다
		assertThat(search.queries).hasSize(1); // 첫 검색에서 5건을 채웠다
	}

	@Test
	void 최근_사건은_날짜순_검색을_더하고_시장_사건은_코스피로_찾는다() {
		event(2L, MarketEvent.MARKET, LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 22), "FALL");
		search.answer = q -> List.of();
		EventNews news = service(100).news(2L).orElseThrow();
		assertThat(news.status()).isEqualTo("OK");
		assertThat(news.items()).isEmpty();
		assertThat(search.queries).containsExactly("코스피 급락/SIM", "코스피 주가/SIM", "코스피/DATE");
	}

	@Test
	void 키가_없으면_부르지_않고_UNAVAILABLE() {
		search.enabled = false;
		EventNews news = service(100).news(1L).orElseThrow();
		assertThat(news.status()).isEqualTo("UNAVAILABLE");
		assertThat(news.items()).isEmpty();
		assertThat(search.queries).isEmpty();
	}

	@Test
	void 호출이_실패하면_UNAVAILABLE이고_예외를_던지지_않는다() {
		search.answer = q -> {
			throw new NewsSearch.Unavailable("NAVER 500 SE99", false);
		};
		assertThat(service(100).news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE");
		search.answer = q -> {
			throw new IllegalStateException("시간 초과");
		};
		assertThat(service(100).news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE");
	}

	@Test
	void 앞_검색이_찾은_기사가_있으면_뒤_검색이_실패해도_찾은_것을_보인다() {
		search.answer = q -> {
			if (q.endsWith("주가/SIM")) {
				throw new NewsSearch.Unavailable("NAVER 500 SE99", false);
			}
			return List.of(at("사건 중", "https://a.example.com/1", "2026-03-11T09:00:00"));
		};
		EventNews news = service(100).news(1L).orElseThrow();
		assertThat(news.status()).isEqualTo("OK");
		assertThat(news.items()).hasSize(1);
	}

	@Test
	void 하루_한도_429를_받으면_그날은_더_부르지_않고_다음_날_다시_부른다() {
		search.answer = q -> {
			throw new NewsSearch.Unavailable("NAVER 429", true);
		};
		EventNewsService s = service(100);
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE");
		assertThat(search.queries).hasSize(1);
		search.answer = q -> List.of();
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE");
		assertThat(search.queries).hasSize(1);

		// 다음 날(KST) 0시가 지나면 다시 부른다
		clock.now = Instant.parse("2026-10-28T15:00:00Z");
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("OK");
	}

	@Test
	void 서버_하루_상한을_넘으면_부르지_않는다() {
		search.answer = q -> List.of();
		EventNewsService s = service(3);
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("OK"); // 2번
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE"); // 1번 부르고 상한
		assertThat(search.queries).hasSize(3);
		assertThat(s.news(1L).orElseThrow().status()).isEqualTo("UNAVAILABLE");
		assertThat(search.queries).hasSize(3);
	}

	@Test
	void 빈_설정이면_기본_상한() {
		search.answer = q -> List.of();
		assertThat(new EventNewsService(events, instruments, search, clock, null).news(1L).orElseThrow().status()).isEqualTo("OK");
	}

	@Test
	void 없는_사건은_비어_있다() {
		assertThat(service(100).news(99L)).isEmpty();
	}

	static class MovingClock extends Clock {
		Instant now;

		MovingClock(Instant now) {
			this.now = now;
		}

		@Override
		public java.time.ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return Clock.fixed(now, zone);
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	static class StubSearch implements NewsSearch {
		boolean enabled = true;
		Function<String, List<Article>> answer = q -> List.of();
		final List<String> queries = new ArrayList<>();

		@Override
		public boolean enabled() {
			return enabled;
		}

		@Override
		public boolean sample() {
			return false;
		}

		@Override
		public List<Article> search(String query, Sort sort, LocalDate from, LocalDate to) {
			String key = query + "/" + sort;
			queries.add(key);
			return answer.apply(key);
		}
	}
}
