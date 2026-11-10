package com.flexable.web.guide;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.guide.GuideContentDtos.ViewCount;
import com.flexable.web.guide.GuideContentDtos.ViewCounts;

/**
 * 금융 가이드 글별 조회수(2026-11-10 결정). (글, 방문자, 날짜)당 한 번만 센다.
 * 방문자 값은 브라우저가 만든 임의 UUID이고 계정·IP와 연결하지 않는다. 합계는 계속 남고 방문자 기록은 30일 뒤 지운다.
 */
@Service
public class GuideContentViewService {

	static final int RETENTION_DAYS = 30;
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final Pattern UUID_FORMAT = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

	private final GuideContentViewCountRepository counts;
	private final GuideContentViewLogRepository logs;
	private final Clock clock;

	public GuideContentViewService(GuideContentViewCountRepository counts, GuideContentViewLogRepository logs, Clock clock) {
		this.counts = counts;
		this.logs = logs;
		this.clock = clock;
	}

	/**
	 * 열람 한 건을 센다. 등록되지 않은 글은 404, 방문자 값이 UUID가 아니면 400. 이미 센 열람은 조용히 넘어간다.
	 * 메서드 전체를 한 트랜잭션으로 묶지 않는다. 동시 요청의 중복 저장 오류를 잡은 뒤에도 트랜잭션이 실패로 끝나지 않게 하기 위해서다.
	 * 기록과 더하기 사이에 서버가 멈추면 한 번 덜 세일 수 있지만 조회수는 정렬에만 쓰여 괜찮다.
	 */
	public void record(String contentId, String viewerId) {
		if (viewerId == null || !UUID_FORMAT.matcher(viewerId).matches()) {
			throw new ApiException(ErrorCode.VALIDATION_FAILED);
		}
		if (!counts.existsById(contentId)) {
			throw new ApiException(ErrorCode.NOT_FOUND);
		}
		String viewer = viewerId.toLowerCase();
		LocalDate today = LocalDate.now(clock.withZone(SEOUL));
		if (logs.existsByContentIdAndViewerIdAndViewedOn(contentId, viewer, today)) {
			return;
		}
		try {
			logs.saveAndFlush(new GuideContentViewLog(contentId, viewer, today));
		} catch (DataIntegrityViolationException e) {
			return; // 같은 열람이 동시에 들어온 경우. 이미 센 것으로 본다
		}
		counts.increment(contentId);
	}

	/** 등록된 글 전부의 누적 조회수 */
	@Transactional(readOnly = true)
	public ViewCounts all() {
		return new ViewCounts(counts.findAll().stream().map(c -> new ViewCount(c.getContentId(), c.getViewCount())).toList());
	}

	@Transactional
	public int deleteExpired() {
		return logs.deleteOlderThan(LocalDate.now(clock.withZone(SEOUL)).minusDays(RETENTION_DAYS));
	}
}
