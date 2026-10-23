package com.flexable.web.news;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.news.NewsDtos.Audience;
import com.flexable.web.news.NewsDtos.CalcLink;
import com.flexable.web.news.NewsDtos.NewsFeed;
import com.flexable.web.news.NewsDtos.NewsItem;
import com.flexable.web.news.NewsDtos.PolicyDraft;
import com.flexable.web.news.NewsDtos.SaveOutcome;
import com.flexable.web.news.NewsDtos.Source;
import com.flexable.web.news.YouthNews.ReviewStatus;

/**
 * 청년 금융 소식 저장소의 공개 창구. 읽기는 api(화면), 쓰기는 worker(ingest)가 쓴다. 외부 API는 부르지 않는다(04 §8).
 * 화면에는 승인(APPROVED)된 소식만, 그중 카드 필수 항목(제목·나에게 얼마·오늘 할 일·출처·지역)이 다 있는 것만 내보낸다.
 */
@Service
public class NewsService {

	/** 미리보기에서 사람이 아직 쓰지 않은 항목 자리에 넣는 문구. 금액·기한을 만들어 넣지 않는다. */
	static final String PREVIEW_BENEFIT = "검수 전 초안 · 지원 내용은 공고문에서 확인";
	static final String PREVIEW_ACTION = "공고문에서 신청 방법 확인하기";
	static final String PREVIEW_SUMMARY = "검수 전 초안";
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	private final YouthNewsRepository news;
	private final YouthNewsRawRepository raws;
	private final Clock clock;
	private final boolean previewDrafts;

	public NewsService(YouthNewsRepository news, YouthNewsRawRepository raws, Clock clock,
			@Value("${app.news.preview-drafts:false}") boolean previewDrafts) {
		this.news = news;
		this.raws = raws;
		this.clock = clock;
		this.previewDrafts = previewDrafts;
	}

	// ───────── 읽기(api) ─────────

	/**
	 * 승인된 소식. 필터는 고르지 않으면 빼고 본다. 분야: 소식이 드는 분야 중 하나라도 맞으면 보인다.
	 * 나이: 원문에서 확인 못 한 쪽(null)은 막지 않는다. 지역: 전국 소식은 어느 지역을 골라도 보인다. 지역을 확인 못 한 소식은 지역을 고르면 빠진다.
	 * 신청 날짜가 없는데 원문의 사업기간이 끝난 소식은 마감으로 보고 뺀다(마감일이 지난 소식은 화면이 목록에서 내린다).
	 * 미리보기(app.news.preview-drafts, local 프로필 전용)면 검수 전 초안도 넣고, 사람이 쓸 항목은 미리보기 문구로 채운다.
	 */
	@Transactional(readOnly = true)
	public NewsFeed list(Integer age, String region, NewsCategory category) {
		List<YouthNews> rows = previewDrafts
				? news.findByReviewStatusInOrderByIdAsc(List.of(ReviewStatus.APPROVED, ReviewStatus.DRAFT))
				: news.findByReviewStatusOrderByIdAsc(ReviewStatus.APPROVED);
		LocalDate today = LocalDate.now(clock.withZone(SEOUL));
		List<NewsItem> items = rows.stream()
			.filter(n -> previewDrafts && n.getReviewStatus() == ReviewStatus.DRAFT ? previewable(n) : publishable(n))
			.filter(n -> !n.endedWithoutApplyDates(today))
			.filter(n -> category == null || n.categoryList().contains(category))
			.filter(n -> age == null || ((n.getAgeMin() == null || n.getAgeMin() <= age) && (n.getAgeMax() == null || n.getAgeMax() >= age)))
			.filter(n -> region == null || region.isBlank() || matchesRegion(n.regionsValue(), region.trim()))
			.map(n -> view(n, n.getReviewStatus() == ReviewStatus.DRAFT))
			.toList();
		return new NewsFeed(items, previewDrafts);
	}

	private static boolean publishable(YouthNews n) {
		return previewable(n) && notBlank(n.getBenefit()) && notBlank(n.getAction());
	}

	private static boolean previewable(YouthNews n) {
		return notBlank(n.getTitle()) && notBlank(n.getSourceOrg()) && notBlank(n.getSourceUrl()) && n.regionsValue() != null;
	}

	private static boolean matchesRegion(Object regions, String region) {
		return YouthNews.NATIONWIDE.equals(regions) || regions instanceof List<?> l && l.contains(region);
	}

	private static NewsItem view(YouthNews n, boolean draft) {
		CalcTarget c = n.getCalcTarget();
		List<NewsCategory> cats = n.categoryList();
		return new NewsItem(String.valueOf(n.getId()), cats.getFirst(), cats, n.getTitle(), fill(n.getBenefit(), draft, PREVIEW_BENEFIT),
				new Audience(fill(n.getAudienceSummary(), draft, PREVIEW_SUMMARY), n.getAgeMin(), n.getAgeMax(), n.getIncomeLimit()),
				n.regionsValue(), n.getApplyStart(), n.getApplyDeadline(), n.isAlwaysOpen(), fill(n.getAction(), draft, PREVIEW_ACTION),
				new Source(n.getSourceOrg(), n.getSourceUrl(), n.getAsOf()), n.getPostedAt(), n.keywordList(),
				c == null ? null : new CalcLink(c.to(), c.label()), n.getCorrectedAt(), n.getSlot());
	}

	private static String fill(String value, boolean draft, String placeholder) {
		return draft && !notBlank(value) ? placeholder : value;
	}

	private static boolean notBlank(String s) {
		return s != null && !s.isBlank();
	}

	// ───────── 쓰기(worker) ─────────

	/**
	 * 수집한 정책 한 건을 원문·초안으로 저장한다. 처음 보는 정책은 DRAFT로 만들고, DRAFT면 새 원문으로 갱신한다.
	 * 원문이 그대로여도 DRAFT는 변환 결과(분야 규칙 등)가 바뀌었으면 다시 채운다. 승인·반려된 카드는 사람이 본 내용이라 덮어쓰지 않는다.
	 */
	@Transactional
	public SaveOutcome saveCollected(PolicyDraft d) {
		Objects.requireNonNull(d.externalId(), "externalId");
		String hash = sha256(d.payload());
		YouthNewsRaw raw = raws.findBySourceAndExternalId(d.source(), d.externalId()).orElse(null);
		if (raw != null && hash.equals(raw.getContentHash())) {
			YouthNews card = news.findBySourceAndExternalId(d.source(), d.externalId()).orElse(null);
			boolean remapped = card != null && card.getReviewStatus() == ReviewStatus.DRAFT && card.fillDraft(d, raw.getId(), clock.instant());
			return remapped ? SaveOutcome.UPDATED : SaveOutcome.UNCHANGED;
		}
		if (raw == null) {
			raw = new YouthNewsRaw(d.source(), d.externalId());
		}
		raw.update(d.payload(), hash, clock.instant());
		raw = raws.save(raw);

		YouthNews card = news.findBySourceAndExternalId(d.source(), d.externalId()).orElse(null);
		if (card == null) {
			card = new YouthNews(d.source(), d.externalId(), clock.instant());
			card.fillDraft(d, raw.getId(), clock.instant());
			news.save(card);
			return SaveOutcome.CREATED;
		}
		if (card.getReviewStatus() != ReviewStatus.DRAFT) {
			card.linkRaw(raw.getId());
			return SaveOutcome.KEPT;
		}
		card.fillDraft(d, raw.getId(), clock.instant());
		return SaveOutcome.UPDATED;
	}

	private static String sha256(String s) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
