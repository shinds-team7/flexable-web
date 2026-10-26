package com.flexable.web.news;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.news.NewsDtos.Audience;
import com.flexable.web.news.NewsDtos.CalcLink;
import com.flexable.web.news.NewsDtos.NewsFeed;
import com.flexable.web.news.NewsDtos.NewsItem;
import com.flexable.web.news.NewsDtos.PolicyDraft;
import com.flexable.web.news.NewsDtos.SaveOutcome;
import com.flexable.web.news.NewsDtos.Source;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;
import com.flexable.web.news.YouthNews.ReviewStatus;

/**
 * 청년 금융 소식 저장소의 공개 창구. 읽기는 api(화면), 쓰기는 worker(ingest)가 쓴다. 외부 API는 부르지 않는다(04 §8).
 * 수집한 소식은 사람 검수 없이 화면에 나간다(2026-10-26 결정). 반려(REJECTED)한 것과 카드 필수 항목(제목·출처·지역)이 빠진 것만 뺀다.
 * 요약(summary)은 worker가 Gemini로 만들어 applySummaries로 넣는다.
 */
@Service
public class NewsService {

	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	private final YouthNewsRepository news;
	private final YouthNewsRawRepository raws;
	private final Clock clock;

	public NewsService(YouthNewsRepository news, YouthNewsRawRepository raws, Clock clock) {
		this.news = news;
		this.raws = raws;
		this.clock = clock;
	}

	// ───────── 읽기(api) ─────────

	/**
	 * 화면에 내보낼 소식. 필터는 고르지 않으면 빼고 본다. 분야: 소식이 드는 분야 중 하나라도 맞으면 보인다.
	 * 나이: 원문에서 확인 못 한 쪽(null)은 막지 않는다. 지역: 전국 소식은 어느 지역을 골라도 보인다. 지역을 확인 못 한 소식은 내보내지 않는다.
	 * 신청 날짜가 없는데 원문의 사업기간이 끝난 소식은 마감으로 보고 뺀다(마감일이 지난 소식은 화면이 목록에서 내린다).
	 */
	@Transactional(readOnly = true)
	public NewsFeed list(Integer age, String region, NewsCategory category) {
		LocalDate today = LocalDate.now(clock.withZone(SEOUL));
		List<NewsItem> items = news.findByReviewStatusNotOrderByIdAsc(ReviewStatus.REJECTED).stream()
			.filter(NewsService::publishable)
			.filter(n -> !n.endedWithoutApplyDates(today))
			.filter(n -> category == null || n.categoryList().contains(category))
			.filter(n -> age == null || ((n.getAgeMin() == null || n.getAgeMin() <= age) && (n.getAgeMax() == null || n.getAgeMax() >= age)))
			.filter(n -> region == null || region.isBlank() || matchesRegion(n.regionsValue(), region.trim()))
			.map(NewsService::view)
			.toList();
		return new NewsFeed(items);
	}

	private static boolean publishable(YouthNews n) {
		return notBlank(n.getTitle()) && notBlank(n.getSourceOrg()) && notBlank(n.getSourceUrl()) && n.regionsValue() != null;
	}

	private static boolean matchesRegion(Object regions, String region) {
		return YouthNews.NATIONWIDE.equals(regions) || regions instanceof List<?> l && l.contains(region);
	}

	private static NewsItem view(YouthNews n) {
		CalcTarget c = n.getCalcTarget();
		List<NewsCategory> cats = n.categoryList();
		return new NewsItem(String.valueOf(n.getId()), cats.getFirst(), cats, n.getTitle(), n.getSummary(), n.getBenefit(),
				new Audience(n.getAudienceSummary(), n.getAgeMin(), n.getAgeMax(), n.getIncomeLimit()),
				n.regionsValue(), n.getApplyStart(), n.getApplyDeadline(), n.isAlwaysOpen(), n.getAction(),
				new Source(n.getSourceOrg(), n.getSourceUrl(), n.getAsOf()), n.getPostedAt(), n.keywordList(),
				c == null ? null : new CalcLink(c.to(), c.label()), n.getCorrectedAt(), n.getSlot());
	}

	private static boolean notBlank(String s) {
		return s != null && !s.isBlank();
	}

	// ───────── 요약(worker) ─────────

	/**
	 * 요약할 카드: 화면에 나가는 카드 중 아직 요약하지 않았거나 원문이 바뀐 것. 마감 지난 것은 빼고 마감이 가까운 순서
	 * (마감일 없는 것·상시는 뒤)로 최대 limit건. 하루 호출 한도가 있어 남은 것은 다음 실행에 이어서 한다.
	 */
	@Transactional(readOnly = true)
	public List<SummaryTarget> summaryTargets(int limit) {
		LocalDate today = LocalDate.now(clock.withZone(SEOUL));
		List<YouthNews> cards = news.findByReviewStatusNotOrderByIdAsc(ReviewStatus.REJECTED).stream()
			.filter(NewsService::publishable)
			.filter(n -> n.getRawId() != null)
			.filter(n -> !n.endedWithoutApplyDates(today))
			.filter(n -> n.getApplyDeadline() == null || !n.getApplyDeadline().isBefore(today))
			.toList();
		Map<Long, YouthNewsRaw> rawById = new HashMap<>();
		raws.findAllById(cards.stream().map(YouthNews::getRawId).toList()).forEach(r -> rawById.put(r.getId(), r));
		return cards.stream()
			.filter(n -> rawById.containsKey(n.getRawId()) && !rawById.get(n.getRawId()).getContentHash().equals(n.getSummaryHash()))
			.sorted(Comparator.comparing(YouthNews::getApplyDeadline, Comparator.nullsLast(Comparator.naturalOrder()))
				.thenComparing(YouthNews::getId))
			.limit(limit)
			.map(n -> {
				YouthNewsRaw r = rawById.get(n.getRawId());
				return new SummaryTarget(n.getId(), n.getTitle(), r.getPayload(), r.getContentHash());
			})
			.toList();
	}

	/** 요약을 넣는다. 그사이 원문이 또 바뀌었으면(hash가 다르면) 넣지 않는다. 넣은 건수를 돌려준다. */
	@Transactional
	public int applySummaries(List<SummaryResult> results) {
		int applied = 0;
		for (SummaryResult s : results) {
			YouthNews card = news.findById(s.id()).orElse(null);
			if (card == null || card.getRawId() == null) {
				continue;
			}
			String current = raws.findById(card.getRawId()).map(YouthNewsRaw::getContentHash).orElse(null);
			if (s.contentHash().equals(current)) {
				card.applySummary(s.summary(), s.contentHash(), clock.instant());
				applied++;
			}
		}
		return applied;
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
