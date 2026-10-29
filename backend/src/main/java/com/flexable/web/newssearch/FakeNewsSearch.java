package com.flexable.web.newssearch;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;

import com.flexable.web.market.NewsSearch;

/**
 * 키 없이 쓰는 예시 기사(테스트·로컬·화면 확인용, isSample). 실제 기사가 아니다.
 * 받은 기간(from~to) 안 2건과, 기간 밖이라 걸러져야 하는 1건을 돌려준다. 같은 기간이면 검색어가 달라도 같은 링크다.
 */
public class FakeNewsSearch implements NewsSearch {

	private static final ZoneOffset KST = ZoneOffset.ofHours(9);

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public boolean sample() {
		return true;
	}

	@Override
	public List<Article> search(String query, Sort sort, LocalDate from, LocalDate to) {
		// 링크는 기간으로만 정해 검색어를 바꿔 불러도 같은 기사(중복 제거 대상)가 된다
		String key = from.toString().replace("-", "");
		return List.of(
				new Article("[예시] " + query + " 관련 기사", "https://example.com/news/" + key + "-1", "example.com",
						from.plusDays(1).atTime(LocalTime.of(9, 30)).atOffset(KST)),
				new Article("[예시] " + query + " 뒤 시장 반응 기사", "https://example.com/news/" + key + "-2", "example.com",
						to.minusDays(1).atTime(LocalTime.of(16, 10)).atOffset(KST)),
				new Article("[예시] 기간 밖 기사(보이지 않아야 함)", "https://example.com/news/" + key + "-3", "example.com",
						to.plusDays(10).atTime(LocalTime.NOON).atOffset(KST)));
	}
}
