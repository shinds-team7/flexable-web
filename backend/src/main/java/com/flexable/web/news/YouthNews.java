package com.flexable.web.news;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import com.flexable.web.news.NewsDtos.PolicyDraft;

/**
 * 소식 카드(01 §F4). 수집하면 DRAFT로 만들고 사람 검수 없이 화면에 나간다(2026-10-26 결정). REJECTED만 화면에서 뺀다.
 * summary는 worker가 Gemini로 만든 원문 요약이다(검사를 통과한 것만, 없으면 null).
 */
@Entity
@Table(name = "youth_news")
class YouthNews {

	static final String NATIONWIDE = "NATIONWIDE";

	enum ReviewStatus {
		DRAFT, APPROVED, REJECTED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "raw_id")
	private Long rawId;

	@Column(nullable = false, length = 20)
	private String source;

	@Column(name = "external_id", nullable = false, length = 60)
	private String externalId;

	@Enumerated(EnumType.STRING)
	@Column(name = "review_status", nullable = false, length = 10)
	private ReviewStatus reviewStatus;

	/** 쉼표로 이은 분야 이름, 첫 번째가 대표 */
	@Column(nullable = false, length = 80)
	private String categories;

	@Column(nullable = false, length = 200)
	private String title;

	@Column(length = 200)
	private String benefit;

	@Column(name = "audience_summary", length = 200)
	private String audienceSummary;

	@Column(name = "age_min")
	private Integer ageMin;

	@Column(name = "age_max")
	private Integer ageMax;

	@Column(name = "income_limit")
	private Boolean incomeLimit;

	@Column(length = 200)
	private String regions;

	@Column(name = "apply_start")
	private LocalDate applyStart;

	@Column(name = "apply_deadline")
	private LocalDate applyDeadline;

	@Column(name = "always_open", nullable = false)
	private boolean alwaysOpen;

	@Column(name = "biz_end")
	private LocalDate bizEnd;

	@Column(length = 200)
	private String action;

	@Column(name = "source_org", length = 100)
	private String sourceOrg;

	@Column(name = "source_url", length = 500)
	private String sourceUrl;

	@Column(name = "as_of", nullable = false)
	private LocalDate asOf;

	@Column(name = "posted_at")
	private LocalDate postedAt;

	@Column(length = 300)
	private String keywords;

	@Enumerated(EnumType.STRING)
	@Column(name = "calc_target", length = 30)
	private CalcTarget calcTarget;

	@Column(length = 4)
	private String slot;

	@Column(name = "corrected_at")
	private LocalDate correctedAt;

	@Column(length = 300)
	private String summary;

	@Column(name = "summary_hash", length = 64)
	private String summaryHash;

	@Column(name = "summarized_at")
	private Instant summarizedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected YouthNews() {
	}

	YouthNews(String source, String externalId, Instant now) {
		this.source = source;
		this.externalId = externalId;
		this.reviewStatus = ReviewStatus.DRAFT;
		this.createdAt = now;
	}

	/**
	 * 수집 값으로 초안을 채운다. 사람이 쓰는 항목(benefit·action·audienceSummary·calcTarget·slot)은 건드리지 않는다.
	 * 바뀐 것이 있으면 true(원문이 그대로여도 변환 규칙이 바뀌었으면 다시 채워진다).
	 */
	boolean fillDraft(PolicyDraft d, Long rawId, Instant now) {
		List<Object> before = draftState();
		this.rawId = rawId;
		this.title = cut(d.title(), 200);
		List<NewsCategory> cats = d.categories() == null || d.categories().isEmpty() ? List.of(NewsCategory.ETC) : d.categories();
		this.categories = String.join(",", cats.stream().distinct().map(Enum::name).toList());
		this.ageMin = d.ageMin();
		this.ageMax = d.ageMax();
		this.incomeLimit = d.incomeLimit();
		this.regions = d.nationwide() ? NATIONWIDE : d.regions() == null || d.regions().isEmpty() ? null : cut(String.join(",", d.regions()), 200);
		this.applyStart = d.applyStart();
		this.applyDeadline = d.applyDeadline();
		this.alwaysOpen = d.alwaysOpen();
		this.bizEnd = d.bizEnd();
		this.sourceOrg = cut(d.sourceOrg(), 100);
		this.sourceUrl = cut(d.sourceUrl(), 500);
		this.asOf = d.asOf();
		this.postedAt = d.postedAt();
		this.keywords = d.keywords() == null || d.keywords().isEmpty() ? null : cut(String.join(",", d.keywords()), 300);
		boolean changed = !before.equals(draftState());
		if (changed || updatedAt == null) {
			this.updatedAt = now;
		}
		return changed;
	}

	private List<Object> draftState() {
		return Arrays.asList(rawId, title, categories, ageMin, ageMax, incomeLimit, regions, applyStart, applyDeadline, alwaysOpen, bizEnd,
				sourceOrg, sourceUrl, asOf, postedAt, keywords);
	}

	/** 신청 날짜가 없고 상시도 아닌데 원문의 사업기간이 today 전에 끝났으면 true(신청 기간 코드만으로는 마감인지 알 수 없어 사업기간으로 본다). */
	boolean endedWithoutApplyDates(LocalDate today) {
		return !alwaysOpen && applyStart == null && applyDeadline == null && bizEnd != null && bizEnd.isBefore(today);
	}

	void linkRaw(Long rawId) {
		this.rawId = rawId;
	}

	/** 요약을 넣는다. summary가 null이면 검사에서 버린 것이고, hash는 남겨 같은 원문을 다시 요약하지 않는다. */
	void applySummary(String summary, String hash, Instant now) {
		this.summary = summary;
		this.summaryHash = hash;
		this.summarizedAt = now;
	}

	Long getRawId() {
		return rawId;
	}

	String getSummary() {
		return summary;
	}

	String getSummaryHash() {
		return summaryHash;
	}

	private static String cut(String s, int max) {
		return s == null ? null : s.length() <= max ? s : s.substring(0, max);
	}

	/** regions 열 → API 값("NATIONWIDE" 또는 이름 목록). 원문에서 확인 못 했으면 null */
	Object regionsValue() {
		if (regions == null) {
			return null;
		}
		return NATIONWIDE.equals(regions) ? NATIONWIDE : split(regions);
	}

	List<String> keywordList() {
		return keywords == null ? List.of() : split(keywords);
	}

	private static List<String> split(String s) {
		return Arrays.stream(s.split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList();
	}

	Long getId() {
		return id;
	}

	ReviewStatus getReviewStatus() {
		return reviewStatus;
	}

	/** 분야 목록(첫 번째가 대표). 알 수 없는 이름은 건너뛰고, 하나도 없으면 기타 */
	List<NewsCategory> categoryList() {
		List<NewsCategory> out = split(categories).stream()
			.filter(s -> Arrays.stream(NewsCategory.values()).anyMatch(c -> c.name().equals(s)))
			.map(NewsCategory::valueOf)
			.toList();
		return out.isEmpty() ? List.of(NewsCategory.ETC) : out;
	}

	String getTitle() {
		return title;
	}

	String getBenefit() {
		return benefit;
	}

	String getAudienceSummary() {
		return audienceSummary;
	}

	Integer getAgeMin() {
		return ageMin;
	}

	Integer getAgeMax() {
		return ageMax;
	}

	Boolean getIncomeLimit() {
		return incomeLimit;
	}

	LocalDate getApplyStart() {
		return applyStart;
	}

	LocalDate getApplyDeadline() {
		return applyDeadline;
	}

	boolean isAlwaysOpen() {
		return alwaysOpen;
	}

	String getAction() {
		return action;
	}

	String getSourceOrg() {
		return sourceOrg;
	}

	String getSourceUrl() {
		return sourceUrl;
	}

	LocalDate getAsOf() {
		return asOf;
	}

	LocalDate getPostedAt() {
		return postedAt;
	}

	CalcTarget getCalcTarget() {
		return calcTarget;
	}

	String getSlot() {
		return slot;
	}

	LocalDate getCorrectedAt() {
		return correctedAt;
	}
}
