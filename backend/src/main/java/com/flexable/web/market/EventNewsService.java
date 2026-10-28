package com.flexable.web.market;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.flexable.web.market.EventDtos.EventNews;
import com.flexable.web.market.EventDtos.NewsItem;
import com.flexable.web.market.NewsSearch.Article;
import com.flexable.web.market.NewsSearch.Sort;

/**
 * 사건 무렵 뉴스 기사(decisions/2026-10-28-event-news). 상세를 열 때 검색을 불러 그대로 돌려주고 저장·캐시하지 않는다.
 * 검색에 날짜 조건이 없어 검색어에 사건 날짜("10월 12일")를 넣어 최대 4번 부르고, 발행 시각이 사건 시작 3일 전 ~ 마지막 날 3일 뒤(KST)인
 * 기사만 남긴다. "종목명 급등" 같은 날짜 없는 정확도순 검색은 지난 사건에서 범위 안 기사를 거의 찾지 못했다(2026-10-28 실제 호출 확인).
 * 하루(KST) 호출 수를 세어 상한을 넘거나 429를 받으면 그날은 더 부르지 않는다. 실패하면 UNAVAILABLE이고 사건 상세는 영향이 없다.
 */
@Service
public class EventNewsService {

	static final int WINDOW_DAYS = 3;
	static final int MAX_ITEMS = 5;
	/** 마지막 날이 이 기간 안인 최근 사건만 날짜순 검색을 더한다(날짜순 100건은 대개 며칠 치). */
	static final int RECENT_DAYS = 30;
	/** NAVER API HUB 하루 25,000회보다 낮게 */
	static final int DEFAULT_DAILY_CAP = 20000;
	static final String OK = "OK";
	static final String UNAVAILABLE = "UNAVAILABLE";
	static final String SOURCE = "네이버 뉴스 검색";
	static final String SAMPLE_SOURCE = "네이버 뉴스 검색(예시)";
	static final String NOTICE = "네이버 뉴스 검색 결과의 기사 제목과 원문 링크를 그대로 보여 줘요. 그 무렵 나온 기사일 뿐 주가가 움직인 원인이라는 뜻은 아니에요.";
	private static final Logger log = LoggerFactory.getLogger(EventNewsService.class);

	private final MarketEventRepository events;
	private final InstrumentRepository instruments;
	private final NewsSearch search;
	private final Clock clock;
	private final int dailyCap;

	private LocalDate day;
	private int used;
	private boolean stopped;

	public EventNewsService(MarketEventRepository events, InstrumentRepository instruments, NewsSearch search, Clock clock,
			@Value("${app.news-search.daily-cap:}") Integer dailyCap) {
		this.events = events;
		this.instruments = instruments;
		this.search = search;
		this.clock = clock;
		this.dailyCap = dailyCap == null ? DEFAULT_DAILY_CAP : dailyCap; // .env에 빈 값으로 두면 null
	}

	/** 없는 사건이면 비어 있다(404). 외부 호출 중에는 DB 트랜잭션을 잡지 않는다. */
	public Optional<EventNews> news(long id) {
		Optional<MarketEvent> found = events.findById(id).filter(e -> EventDetector.VERSION.equals(e.getDetectorVersion()));
		if (found.isEmpty()) {
			return Optional.empty();
		}
		MarketEvent e = found.get();
		Optional<Instrument> inst = instruments.findById(e.getInstrumentId());
		if (inst.isEmpty()) {
			return Optional.empty();
		}
		boolean market = MarketEvent.MARKET.equals(e.getScope());
		String name = market ? "코스피" : inst.get().getName();
		LocalDate from = e.getStartDate().minusDays(WINDOW_DAYS);
		LocalDate to = e.getEndDate().plusDays(WINDOW_DAYS);
		if (!search.enabled()) {
			return Optional.of(result(id, from, to, UNAVAILABLE, List.of()));
		}

		List<Query> plan = plan(name, market, e.getStartDate(), e.getEndDate(), e.getDirection(),
				!e.getEndDate().isBefore(LocalDate.now(clock.withZone(EventService.SEOUL)).minusDays(RECENT_DAYS)));
		Map<String, Article> picked = new LinkedHashMap<>();
		boolean failed = false;
		for (Query q : plan) {
			if (picked.size() >= MAX_ITEMS) {
				break;
			}
			if (!take()) {
				failed = picked.isEmpty();
				break;
			}
			try {
				for (Article a : search.search(q.text(), q.sort(), from, to)) {
					LocalDate on = a.publishedAt().atZoneSameInstant(EventService.SEOUL).toLocalDate();
					if (!on.isBefore(from) && !on.isAfter(to)) {
						picked.putIfAbsent(a.url(), a);
					}
				}
			}
			catch (NewsSearch.Unavailable u) {
				if (u.stopsToday()) {
					stopToday();
				}
				log.warn("뉴스 검색 실패(사건 {}): {}", id, u.getMessage());
				failed = picked.isEmpty();
				break;
			}
			catch (RuntimeException ex) {
				log.warn("뉴스 검색 실패(사건 {}): {}", id, ex.getClass().getSimpleName());
				failed = picked.isEmpty();
				break;
			}
		}
		if (failed) {
			return Optional.of(result(id, from, to, UNAVAILABLE, List.of()));
		}
		List<NewsItem> items = picked.values().stream()
			.sorted(Comparator.comparing(Article::publishedAt))
			.limit(MAX_ITEMS)
			.map(a -> new NewsItem(a.title(), a.url(), a.publisher(), a.publishedAt().atZoneSameInstant(EventService.SEOUL).toOffsetDateTime()))
			.toList();
		return Optional.of(result(id, from, to, OK, items));
	}

	/**
	 * 검색 순서(5건이 차면 멈춘다, 2026-10-28 실제 호출로 고름).
	 * 종목 사건: ① "이름 주가 M월 D일"(시작일, 종목 사건 18개 모두에서 찾음) ② "이름 M월 D일" ③ 여러 날이면 "이름 주가 M월 D일"(마지막 날),
	 * 하루면 "이름 M월 D일 급등|급락".
	 * 시장 사건: ① "M월 D일 마감시황"(시작일, "코스피 M월 D일"로 못 찾던 사건 5개 모두에서 찾음) ② "M월 D일 증시" ③ 여러 날이면
	 * "M월 D일 마감시황"(마지막 날), 하루면 "M월 D일 코스피 마감".
	 * 최근 사건이면 ④ "이름" 날짜순.
	 */
	static List<Query> plan(String name, boolean market, LocalDate start, LocalDate end, String direction, boolean recent) {
		List<Query> plan = new ArrayList<>();
		boolean oneDay = end.equals(start);
		if (market) {
			plan.add(new Query(day(start) + " 마감시황", Sort.SIM));
			plan.add(new Query(day(start) + " 증시", Sort.SIM));
			plan.add(new Query(oneDay ? day(start) + " " + name + " 마감" : day(end) + " 마감시황", Sort.SIM));
		}
		else {
			plan.add(new Query(name + " 주가 " + day(start), Sort.SIM));
			plan.add(new Query(name + " " + day(start), Sort.SIM));
			plan.add(new Query(oneDay ? name + " " + day(start) + " " + ("RISE".equals(direction) ? "급등" : "급락") : name + " 주가 " + day(end),
					Sort.SIM));
		}
		if (recent) {
			plan.add(new Query(name, Sort.DATE));
		}
		return plan;
	}

	/** 2026-10-12 → "10월 12일" */
	private static String day(LocalDate d) {
		return d.getMonthValue() + "월 " + d.getDayOfMonth() + "일";
	}

	private EventNews result(long id, LocalDate from, LocalDate to, String status, List<NewsItem> items) {
		boolean sample = search.sample();
		return new EventNews(id, from, to, status, items, sample ? SAMPLE_SOURCE : SOURCE, NOTICE, sample);
	}

	/** 오늘 한 번 더 불러도 되면 세고 true. 상한을 넘었거나 429를 받은 날이면 false. */
	synchronized boolean take() {
		roll();
		if (stopped || used >= dailyCap) {
			return false;
		}
		used++;
		return true;
	}

	private synchronized void stopToday() {
		roll();
		stopped = true;
	}

	private void roll() {
		LocalDate today = LocalDate.now(clock.withZone(EventService.SEOUL));
		if (!today.equals(day)) {
			day = today;
			used = 0;
			stopped = false;
		}
	}

	record Query(String text, Sort sort) {
	}
}
