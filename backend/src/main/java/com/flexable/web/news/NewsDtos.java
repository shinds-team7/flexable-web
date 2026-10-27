package com.flexable.web.news;

import java.time.LocalDate;
import java.util.List;

/**
 * 소식 API·수집 입력 형식. 응답 필드는 01 §F4 "카드 필수 항목 = API 필드"이고 화면 src/data/news.ts의 YouthNews와 같다.
 * 원문에서 확인하지 못한 값은 null로 보낸다(조건 없음이 아니다).
 */
public final class NewsDtos {

	private NewsDtos() {
	}

	/** GET /youth-news 응답 */
	public record NewsFeed(List<NewsItem> items) {
	}

	/**
	 * regions: "NATIONWIDE" 또는 시도 이름 목록(["서울","경기"]).
	 * category는 대표 분야(카드 배지), categories는 이 소식이 드는 분야 전부(탭·필터는 이것으로 거른다).
	 * summary는 Gemini가 원문을 1~3문장으로 줄인 것(화면에 "AI 요약" 표시). 아직 없거나 검사에서 버렸으면 null.
	 * benefit·action은 사람이 쓰던 항목이라 지금은 비어 있다(null).
	 */
	public record NewsItem(String id, NewsCategory category, List<NewsCategory> categories, String title, String summary, String benefit, Audience audience, Object regions,
			LocalDate applyStart, LocalDate applyDeadline, boolean alwaysOpen, String action, Source source, LocalDate postedAt,
			List<String> keywords, CalcLink calcLink, LocalDate correctedAt, String slot) {
	}

	/** summary는 나이 외 조건 요약. incomeLimit은 원문에 소득 기준이 있으면 true, 언급이 없으면 null */
	public record Audience(String summary, Integer ageMin, Integer ageMax, Boolean incomeLimit) {
	}

	/** 1차 출처: 기관명 + 원문 링크 + 기준일 */
	public record Source(String org, String url, LocalDate asOf) {
	}

	public record CalcLink(String to, String label) {
	}

	/**
	 * 수집한 정책 한 건(worker → news). 카드 초안을 만들 때 쓴다. 금액·기한은 원문 값만 넣고 만들어 내지 않는다.
	 * 요약(summary)은 여기서 만들지 않고, 저장한 뒤 worker가 원문(payload)으로 따로 만든다(SummaryTarget).
	 * regions: null이면 원문에서 확인 못 함, 빈 목록이 아니라 "전국"이면 nationwide=true.
	 * categories: 첫 번째가 대표 분야. 비어 있으면 기타(ETC)로 저장한다.
	 * bizEnd: 원문의 사업기간 끝. 신청 날짜가 없고 상시도 아닌데 사업기간이 끝났으면 화면 목록에서 뺀다.
	 */
	public record PolicyDraft(String source, String externalId, String payload, String title, List<NewsCategory> categories, Integer ageMin,
			Integer ageMax, Boolean incomeLimit, boolean nationwide, List<String> regions, LocalDate applyStart, LocalDate applyDeadline,
			boolean alwaysOpen, String sourceOrg, String sourceUrl, LocalDate asOf, LocalDate postedAt, List<String> keywords,
			LocalDate bizEnd) {
	}

	/** 요약할 카드 한 건(news → worker). payload는 저장한 원문, contentHash는 그 원문의 hash(요약을 넣을 때 되돌려 준다) */
	public record SummaryTarget(long id, String title, String payload, String contentHash) {
	}

	/** 요약 결과 한 건(worker → news). summary가 null이면 검사에서 버린 것 */
	public record SummaryResult(long id, String contentHash, String summary) {
	}

	/** 수집 한 건을 저장한 결과. KEPT = 사람이 손댄(APPROVED·REJECTED) 소식이라 원문만 갱신하고 카드는 그대로 둠 */
	public enum SaveOutcome {
		CREATED, UPDATED, UNCHANGED, KEPT
	}
}
