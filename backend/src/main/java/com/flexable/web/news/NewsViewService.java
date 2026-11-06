package com.flexable.web.news;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.news.NewsDtos.HotItem;
import com.flexable.web.news.NewsDtos.HotNews;
import com.flexable.web.news.YouthNews.ReviewStatus;

/**
 * "요즘 많이 본 지원금" 집계(2026-11-03 결정). 열람은 (소식, 방문자, 날짜)당 한 번만 센다.
 * 방문자 값은 브라우저가 만든 임의 UUID이고 계정·IP와 연결하지 않는다. 구글 검색량은 공식 API·키가 없어 쓰지 않고 basis=SITE로 알린다.
 * 값을 마음대로 만들어 순위를 흔드는 것을 줄이려고 방문자 한 명이 하루에 셀 수 있는 소식 수를 제한한다.
 */
@Service
public class NewsViewService {

	static final int WINDOW_DAYS = 7;
	static final int RETENTION_DAYS = 30;
	static final int DAILY_CAP_PER_VIEWER = 40;
	static final int HOT_LIMIT = 10;
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final Pattern UUID_FORMAT = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

	private final YouthNewsViewRepository views;
	private final YouthNewsRepository news;
	private final Clock clock;

	public NewsViewService(YouthNewsViewRepository views, YouthNewsRepository news, Clock clock) {
		this.views = views;
		this.news = news;
		this.clock = clock;
	}

	/** 열람 한 건을 센다. 없는·반려·미요약 소식은 404, 방문자 값이 UUID가 아니면 400. 이미 센 것·하루 한도를 넘은 것은 조용히 넘어간다. */
	@Transactional
	public void record(long newsId, String viewerId) {
		if (viewerId == null || !UUID_FORMAT.matcher(viewerId).matches()) {
			throw new ApiException(ErrorCode.VALIDATION_FAILED);
		}
		if (news.findById(newsId).filter(n -> n.getReviewStatus() != ReviewStatus.REJECTED).filter(NewsService::publishable).isEmpty()) {
			throw new ApiException(ErrorCode.NOT_FOUND);
		}
		String viewer = viewerId.toLowerCase();
		LocalDate today = LocalDate.now(clock.withZone(SEOUL));
		if (views.existsByNewsIdAndViewerIdAndViewedOn(newsId, viewer, today)
				|| views.countByViewerIdAndViewedOn(viewer, today) >= DAILY_CAP_PER_VIEWER) {
			return;
		}
		try {
			views.saveAndFlush(new YouthNewsView(newsId, viewer, today));
		} catch (DataIntegrityViolationException e) {
			// 같은 열람이 동시에 들어온 경우. 이미 센 것으로 본다
		}
	}

	/** 최근 7일(오늘 포함) 서로 다른 방문자가 많이 연 소식 순. 열람이 없으면 빈 목록. */
	@Transactional(readOnly = true)
	public HotNews hot() {
		LocalDate since = LocalDate.now(clock.withZone(SEOUL)).minusDays(WINDOW_DAYS - 1L);
		Set<Long> published = news.findByReviewStatusNotOrderByIdAsc(ReviewStatus.REJECTED).stream()
			.filter(NewsService::publishable).map(YouthNews::getId).collect(Collectors.toSet());
		List<HotItem> items = views.visitorsSince(since).stream()
			.filter(r -> published.contains(((Number) r[0]).longValue()))
			.limit(HOT_LIMIT)
			.map(r -> new HotItem(String.valueOf(r[0]), ((Number) r[1]).intValue()))
			.toList();
		return new HotNews("SITE", WINDOW_DAYS, items);
	}

	@Transactional
	public int deleteExpired() {
		return views.deleteOlderThan(LocalDate.now(clock.withZone(SEOUL)).minusDays(RETENTION_DAYS));
	}
}
