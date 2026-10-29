package com.flexable.web.market;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 사건 무렵 뉴스 기사 검색(decisions/2026-10-28-event-news). 구현은 newssearch 패키지(NAVER API HUB·예시).
 * 결과는 저장·캐시하지 않는다(검색 API 특약 2.3). api가 요청 중 부르는 외부 호출 예외다(04 §8 ④).
 */
public interface NewsSearch {

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 부르지 않는다. */
	boolean enabled();

	/** 예시 자료면 true(화면에 "예시"). */
	boolean sample();

	/**
	 * 한 번 검색한다. from·to는 예시 소스가 날짜를 맞추는 데만 쓰고, 네이버는 날짜로 검색하지 못해 쓰지 않는다(거르기는 호출한 쪽).
	 * 키 문제·한도·오류면 Unavailable.
	 */
	List<Article> search(String query, Sort sort, LocalDate from, LocalDate to);

	enum Sort {
		/** 정확도순 */
		SIM,
		/** 날짜순(최신부터) */
		DATE
	}

	/** 기사 한 건. title은 태그·엔티티를 푼 원문 제목, url은 원문 링크, publisher는 원문 링크 호스트(없으면 null). */
	record Article(String title, String url, String publisher, OffsetDateTime publishedAt) {
	}

	/** 이번 요청에서 더 부르지 않는다. stopsToday면 그날(KST) 남은 요청도 부르지 않는다(429 하루 한도). */
	class Unavailable extends RuntimeException {

		private final boolean stopsToday;

		public Unavailable(String message, boolean stopsToday) {
			super(message);
			this.stopsToday = stopsToday;
		}

		public boolean stopsToday() {
			return stopsToday;
		}
	}
}
