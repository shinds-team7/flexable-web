package com.flexable.web.errorlog;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.user.UserWithdrawalListener;

/**
 * 오류 기록 저장(docs/decisions/2026-11-08-error-events.md). 같은 날 같은 오류는 한 줄로 묶어 횟수만 올리고,
 * 하루 새 줄은 NEW_PER_DAY까지만 만든다. 30일(KEEP_DAYS) 지난 줄은 매일 지우고, 탈퇴하면 그 회원 줄도 지운다.
 * 저장 전에 금액·전화번호처럼 보이는 숫자(3자리 이상)와 이메일을 가린다.
 */
@Service
public class ErrorEventService implements UserWithdrawalListener {

	static final int KEEP_DAYS = 30;
	static final int NEW_PER_DAY = 500;
	static final int MESSAGE_MAX = 500;
	static final int STACK_MAX = 4000;

	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+");
	private static final Pattern NUMBER = Pattern.compile("\\d[\\d,.]+\\d");
	private static final Pattern ID_SEGMENT = Pattern.compile("/(\\d+|[0-9a-fA-F-]{16,})(?=/|$)");

	private final ErrorEventRepository events;
	private final Clock clock;

	public ErrorEventService(ErrorEventRepository events, Clock clock) {
		this.events = events;
		this.clock = clock;
	}

	/** 저장한다. 호출한 쪽의 트랜잭션(이미 실패했을 수 있다)과 따로 커밋한다. */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void record(ErrorReport raw) {
		ErrorReport r = clean(raw);
		Instant now = clock.instant();
		LocalDate day = LocalDate.ofInstant(now, SEOUL);
		String fingerprint = fingerprint(r);
		var existing = events.findByDayAndFingerprint(day, fingerprint);
		if (existing.isPresent()) {
			existing.get().hit(r, now);
			return;
		}
		if (events.countByDay(day) >= NEW_PER_DAY) {
			return;
		}
		events.saveAndFlush(new ErrorEvent(day, fingerprint, r, now));
	}

	/** 30일 지난 기록을 지우고 지운 줄 수를 돌려준다. */
	@Transactional
	public int deleteExpired() {
		return events.deleteBefore(LocalDate.ofInstant(clock.instant(), SEOUL).minusDays(KEEP_DAYS));
	}

	/** 탈퇴하는 회원이 마지막으로 겪은 오류 줄을 지운다(회원 번호가 남은 줄만). */
	@Override
	@Transactional
	public void onWithdraw(long userId) {
		events.deleteByUserId(userId);
	}

	static ErrorReport clean(ErrorReport r) {
		String message = mask(r.message());
		return new ErrorReport(r.source(), r.kind(), r.userId(), cut(r.appVersion(), 20), cut(r.platform(), 10),
				cut(r.screen(), 100), cut(r.method(), 10), normalizePath(r.path()), r.status(), cut(r.code(), 40),
				message == null || message.isBlank() ? "(메시지 없음)" : cut(message, MESSAGE_MAX),
				cut(maskEmails(r.stack()), STACK_MAX));
	}

	/** 숫자(3자리 이상, 쉼표·점 포함)는 #, 이메일은 ***@*** */
	static String mask(String s) {
		if (s == null) {
			return null;
		}
		return NUMBER.matcher(maskEmails(s)).replaceAll("#");
	}

	private static String maskEmails(String s) {
		return s == null ? null : EMAIL.matcher(s).replaceAll("***@***");
	}

	/** 쿼리(날짜·검색어 등)는 버리고, 숫자·긴 id 경로 조각은 {id}로 묶는다. */
	static String normalizePath(String path) {
		if (path == null || path.isBlank()) {
			return null;
		}
		String p = path.trim();
		int q = p.indexOf('?');
		if (q >= 0) {
			p = p.substring(0, q);
		}
		return cut(ID_SEGMENT.matcher(p).replaceAll("/{id}"), 200);
	}

	/** 같은 오류인지: 출처·종류·상태·코드·메서드·경로·가린 메시지·스택 첫 3줄. 회원·버전은 넣지 않는다. */
	static String fingerprint(ErrorReport r) {
		String stackHead = r.stack() == null ? "" : String.join("\n", r.stack().lines().limit(3).toList());
		String key = String.join("|", r.source().name(), r.kind().name(), String.valueOf(r.status()),
				String.valueOf(r.code()), String.valueOf(r.method()), String.valueOf(r.path()), r.message(), stackHead);
		try {
			return HexFormat.of()
				.formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private static String cut(String s, int max) {
		if (s == null) {
			return null;
		}
		String t = s.trim();
		return t.length() <= max ? t : t.substring(0, max);
	}
}
