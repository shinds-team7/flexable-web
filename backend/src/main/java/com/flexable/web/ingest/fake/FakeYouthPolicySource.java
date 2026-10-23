package com.flexable.web.ingest.fake;

import java.time.LocalDate;
import java.util.List;

import com.flexable.web.ingest.YouthPolicySource;
import com.flexable.web.news.NewsCategory;
import com.flexable.web.news.NewsDtos.PolicyDraft;

/** 키 없이 수집 흐름을 확인하는 가짜 정책. 모두 가상이고(기관 이름에 "예시"), 링크는 온통청년 첫 화면이다. */
public class FakeYouthPolicySource implements YouthPolicySource {

	public static final String SOURCE = "FAKE";
	private static final String URL = "https://www.youthcenter.go.kr";

	@Override
	public String source() {
		return SOURCE;
	}

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public List<PolicyDraft> policies() {
		LocalDate asOf = LocalDate.of(2026, 10, 21);
		return List.of(
				new PolicyDraft(SOURCE, "fake-1", "{\"id\":\"fake-1\"}", "청년 월세 지원(예시)", List.of(NewsCategory.HOUSING), 19, 34, Boolean.TRUE, false,
						List.of("서울"), LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 30), false, "○○시청(예시)", URL, asOf,
						LocalDate.of(2026, 9, 25), List.of("월세", "주거"), null),
				new PolicyDraft(SOURCE, "fake-2", "{\"id\":\"fake-2\"}", "구직 청년 면접 정장 대여(예시)", List.of(NewsCategory.JOB), 18, 39, null, false,
						List.of("경기"), null, null, true, "○○구 일자리센터(예시)", URL, asOf, null, List.of("면접", "취업"), null),
				new PolicyDraft(SOURCE, "fake-3", "{\"id\":\"fake-3\"}", "청년 자산형성 적금(예시)", List.of(NewsCategory.FINANCE), 19, 34, Boolean.TRUE, true,
						null, LocalDate.of(2026, 10, 15), LocalDate.of(2026, 11, 14), false, "○○금융기관(예시)", URL, asOf,
						LocalDate.of(2026, 10, 14), List.of("적금", "저축"), null));
	}
}
