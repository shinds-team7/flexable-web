package com.flexable.web.applink;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.flexable.web.applink.AppApiClient.AppProfile;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiClient.CreatedLink;
import com.flexable.web.applink.AppApiException.Kind;
import com.flexable.web.applink.AppLinkDtos.AppLinkResponse;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.AttemptLimiter;
import com.flexable.web.common.ErrorCode;

/**
 * [앱 연동하기]의 공개 입구(04 §5). 대상 연동은 항상 로그인한 웹 회원 id로 찾고, 브라우저가 보낸 id·linkId는 받지 않는다.
 * 앱 서버 호출은 DB 트랜잭션 밖에서 하고, 저장·삭제만 짧은 트랜잭션으로 한다.
 */
@Service
public class AppLinkService {

	private static final Logger log = LoggerFactory.getLogger(AppLinkService.class);
	/** 코드 입력 실패: 웹 회원당 10분에 5회(04 §5-3) */
	static final int MAX_CODE_FAILURES = 5;
	static final Duration CODE_FAILURE_WINDOW = Duration.ofMinutes(10);

	private final AppLinkRepository links;
	private final AppApiClient app;
	private final LinkIdCipher cipher;
	private final TransactionTemplate tx;
	private final Clock clock;
	private final Duration refreshInterval;
	private final AttemptLimiter codeLimiter;
	/**
	 * 연동 만들기·해제·다시 받기를 처리 중인 회원. 이중 클릭·동시 요청은 기다리지 않고 APP_LINK_IN_PROGRESS로 돌려보낸다
	 * (다시 받기는 저장한 값을 준다. api 한 대 기준, DB 고유 키가 최종 방어).
	 */
	private final Set<Long> busy = ConcurrentHashMap.newKeySet();

	public AppLinkService(AppLinkRepository links, AppApiClient app, LinkIdCipher cipher,
			PlatformTransactionManager txManager, Clock clock, AppLinkProperties props) {
		this.links = links;
		this.app = app;
		this.cipher = cipher;
		this.tx = new TransactionTemplate(txManager);
		this.clock = clock;
		this.refreshInterval = props.refreshInterval();
		this.codeLimiter = new AttemptLimiter(MAX_CODE_FAILURES, CODE_FAILURE_WINDOW, clock);
	}

	/** 앱에서 받은 코드로 연동한다. 이미 연동돼 있으면 APP_LINK_EXISTS(교체하지 않음). */
	public AppLinkResponse link(long userId, String code) {
		String limitKey = String.valueOf(userId);
		codeLimiter.check(limitKey);
		if (!busy.add(userId)) {
			throw new ApiException(ErrorCode.APP_LINK_IN_PROGRESS);
		}
		try {
			if (links.existsByUserId(userId)) {
				throw new ApiException(ErrorCode.APP_LINK_EXISTS);
			}
			CreatedLink created;
			try {
				created = app.create(code);
			}
			catch (AppApiException e) {
				if (e.kind() == Kind.CODE_INVALID) {
					codeLimiter.recordFailure(limitKey);
				}
				if (e.kind() == Kind.RESULT_UNKNOWN) {
					log.warn("앱 연동 생성 결과 불명: userId={}", userId);
				}
				throw toApi(e);
			}
			AppLink saved = save(userId, created);
			codeLimiter.reset(limitKey);
			return sync(saved);
		}
		finally {
			busy.remove(userId);
		}
	}

	/**
	 * 연동 상태(GET). 저장한 마지막 값만 읽고 앱 서버를 부르지 않으며 DB에 쓰지 않는다.
	 * 마지막 확인에서 refreshInterval이 지났으면 sync.due가 true이고, 화면이 refresh로 다시 받는다.
	 */
	@Transactional(readOnly = true)
	public AppLinkResponse status(long userId) {
		return links.findByUserId(userId).map(this::respond).orElseGet(() -> AppLinkResponse.none(app.enabled(), null));
	}

	/**
	 * 앱 서버에서 다시 받는다(POST /app-link/refresh). 다시 받을 때가 아니거나 같은 회원의 연동·해제·다시 받기가 처리 중이면
	 * 앱 서버를 부르지 않고 저장한 값을 준다. 실패하면 마지막 값을 stale로, 앱에서 해제됐으면 웹 연동을 지우고 app_unlinked로 준다.
	 */
	public AppLinkResponse refresh(long userId) {
		if (!busy.add(userId)) {
			return status(userId);
		}
		try {
			AppLink link = links.findByUserId(userId).orElse(null);
			if (link == null) {
				return AppLinkResponse.none(app.enabled(), null);
			}
			return due(link) ? sync(link) : respond(link);
		}
		finally {
			busy.remove(userId);
		}
	}

	/**
	 * 매일 모든 연동을 앱 서버에 다시 확인한다(AppLinkRecheckJob). 웹에 들어오지 않는 회원도 앱에서 해제·앱 탈퇴하면 하루 안에
	 * 웹의 연동 정보가 지워지게 하기 위해서다(방침 제3조·제4조). 처리 중인 회원은 건너뛰고 다음 날 다시 본다.
	 *
	 * @return 이번에 지운(앱에서 해제된) 연동 수
	 */
	public int recheckAll() {
		int removed = 0;
		for (long userId : links.findAllUserIds()) {
			if (!busy.add(userId)) {
				continue;
			}
			try {
				AppLink link = links.findByUserId(userId).orElse(null);
				if (link != null && !sync(link).linked()) {
					removed++;
				}
			}
			catch (RuntimeException e) {
				log.warn("연동 일일 확인 실패: userId={}, cause={}", userId, e.getClass().getSimpleName());
			}
			finally {
				busy.remove(userId);
			}
		}
		return removed;
	}

	/** 웹에서 고친 시드머니를 앱에 반영한 결과. applied면 앱 값이 바뀌었고, failed면 웹에만 남겨야 한다. */
	public record SeedPush(boolean linked, boolean applied, String message) {

		static final SeedPush NOT_LINKED = new SeedPush(false, false, null);

		static SeedPush failed(String message) {
			return new SeedPush(true, false, message);
		}
	}

	static final String PUSH_FAILED = "앱에는 반영하지 못해 웹에만 저장했어요. 잠시 후 다시 저장해 주세요";

	/**
	 * 연동 회원이 웹에서 고친 시드머니 총액을 앱에 반영한다(#83). 성공하면 앱이 돌려준 값으로 연동 값을 바꾼다.
	 * 앱 서버 호출은 트랜잭션 밖에서 하고, 실패해도 예외를 던지지 않고 failed로 돌려준다(웹 저장은 호출한 쪽이 한다).
	 */
	public SeedPush pushSeedMoney(long userId, long total) {
		if (!busy.add(userId)) {
			return SeedPush.failed(PUSH_FAILED);
		}
		try {
			AppLink link = links.findByUserId(userId).orElse(null);
			if (link == null) {
				return SeedPush.NOT_LINKED;
			}
			long rowId = link.getId();
			AppSeedMoney seed;
			try {
				seed = app.updateSeedMoney(cipher.decrypt(link.getLinkIdCipher()), total);
			}
			catch (IllegalStateException e) {
				log.error("연동 정보를 읽지 못해 앱에 반영하지 못함(APP_LINK_ENCRYPTION_KEY 확인): linkRow={}", rowId);
				return SeedPush.failed(PUSH_FAILED);
			}
			catch (AppApiException e) {
				return switch (e.kind()) {
					case LINK_NOT_FOUND -> {
						tx.executeWithoutResult(s -> links.deleteRow(rowId));
						log.info("앱에서 해제된 연동을 정리함: linkRow={}", rowId);
						yield SeedPush.failed("앱 연동이 해제돼 웹에만 저장했어요");
					}
					case BUDGET_NOT_SET -> SeedPush.failed("앱에서 예산을 먼저 설정해야 앱에 반영돼요. 웹에만 저장했어요");
					case REJECTED -> SeedPush.failed(e.detail() != null ? e.detail() + ". 웹에만 저장했어요" : PUSH_FAILED);
					default -> {
						logFailure(e, "시드머니 반영");
						yield SeedPush.failed(PUSH_FAILED);
					}
				};
			}
			if (seed == null) {
				return SeedPush.failed(PUSH_FAILED);
			}
			Instant now = clock.instant();
			tx.executeWithoutResult(s -> links.findById(rowId).ifPresent(l -> l.seedReceived(seed, now)));
			return new SeedPush(true, true, null);
		}
		finally {
			busy.remove(userId);
		}
	}

	/** 웹에서 해제. 앱 서버에서 먼저 지우고, 실패하면(장애) 연동을 그대로 두어 다시 시도할 수 있게 한다. 연동이 없으면 아무것도 하지 않는다. */
	public void unlink(long userId) {
		if (!busy.add(userId)) {
			throw new ApiException(ErrorCode.APP_LINK_IN_PROGRESS);
		}
		try {
			AppLink link = links.findByUserId(userId).orElse(null);
			if (link == null) {
				return;
			}
			String linkId;
			try {
				linkId = cipher.decrypt(link.getLinkIdCipher());
			}
			catch (IllegalStateException e) {
				// 키가 바뀌어 읽을 수 없는 연동은 앱 서버에 해제를 요청할 수 없다. 사용자가 갇히지 않게 웹 쪽만 지운다.
				log.error("연동 정보를 읽지 못해 웹 연동만 지움(APP_LINK_ENCRYPTION_KEY 확인): linkRow={}", link.getId());
				tx.executeWithoutResult(s -> links.deleteRow(link.getId()));
				return;
			}
			try {
				app.delete(linkId);
			}
			catch (AppApiException e) {
				if (e.kind() != Kind.LINK_NOT_FOUND) {
					throw toApi(e);
				}
			}
			tx.executeWithoutResult(s -> links.deleteRow(link.getId()));
		}
		finally {
			busy.remove(userId);
		}
	}

	/**
	 * 웹 탈퇴(user.withdraw 트랜잭션 안에서 불림). 웹의 연동은 바로 지우고, 앱 서버 해제는 커밋 뒤에 한 번 요청한다.
	 * 앱 서버 장애로 해제하지 못해도 탈퇴는 막지 않는다(앱의 연동 목록에 남으면 앱에서 지울 수 있다).
	 */
	@Transactional
	public void removeForWithdrawal(long userId) {
		AppLink link = links.findByUserId(userId).orElse(null);
		if (link == null) {
			return;
		}
		String linkId;
		try {
			linkId = cipher.decrypt(link.getLinkIdCipher());
		}
		catch (IllegalStateException e) {
			log.error("탈퇴 중 연동 정보를 읽지 못해 앱 서버 해제를 건너뜀: userId={}", userId);
			linkId = null;
		}
		links.deleteRow(link.getId());
		if (linkId == null) {
			return;
		}
		String target = linkId;
		Runnable release = () -> releaseQuietly(target, "탈퇴");
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					release.run();
				}
			});
		}
		else {
			release.run();
		}
	}

	/** 앱에 연동을 만든 뒤 웹 DB 저장이 실패하면 앱 쪽 연동을 지워 되돌린다. */
	private AppLink save(long userId, CreatedLink created) {
		try {
			return tx.execute(s -> links.saveAndFlush(
					new AppLink(userId, cipher.encrypt(created.linkId()), created.profile(), clock.instant())));
		}
		catch (RuntimeException e) {
			log.warn("앱 연동 저장 실패, 앱 서버 연동을 되돌림: userId={}, cause={}", userId, e.getClass().getSimpleName());
			releaseQuietly(created.linkId(), "저장 실패 보상");
			if (e instanceof DataIntegrityViolationException) {
				throw new ApiException(ErrorCode.APP_LINK_EXISTS);
			}
			throw new ApiException(ErrorCode.INTERNAL_ERROR);
		}
	}

	private AppLinkResponse sync(AppLink link) {
		long rowId = link.getId();
		Instant now = clock.instant();
		try {
			String linkId = cipher.decrypt(link.getLinkIdCipher());
			AppProfile profile = app.profile(linkId);
			AppSeedMoney seed;
			try {
				seed = app.seedMoney(linkId);
			}
			catch (AppApiException e) {
				if (e.kind() != Kind.BUDGET_NOT_SET) {
					throw e;
				}
				seed = null;
			}
			AppSeedMoney received = seed;
			AppLink updated = tx.execute(s -> links.findById(rowId).map(l -> {
				l.synced(profile, received, now);
				return l;
			}).orElse(null));
			return updated == null ? AppLinkResponse.none(app.enabled(), null) : respond(updated);
		}
		catch (AppApiException e) {
			if (e.kind() == Kind.LINK_NOT_FOUND) {
				tx.executeWithoutResult(s -> links.deleteRow(rowId));
				log.info("앱에서 해제된 연동을 정리함: linkRow={}", rowId);
				return AppLinkResponse.none(app.enabled(), AppLinkDtos.REASON_APP_UNLINKED);
			}
			logFailure(e, "조회");
		}
		catch (IllegalStateException e) {
			log.error("연동 정보를 읽지 못함(APP_LINK_ENCRYPTION_KEY 확인): linkRow={}", rowId);
		}
		AppLink checked = tx.execute(s -> links.findById(rowId).map(l -> {
			l.checkFailed(now);
			return l;
		}).orElse(null));
		return checked == null ? AppLinkResponse.none(app.enabled(), null) : respond(checked);
	}

	/** 마지막 확인(성공·실패)에서 refreshInterval이 지났는지. 0이면 늘 다시 받는다. */
	private boolean due(AppLink link) {
		return !(refreshInterval.isPositive() && link.getCheckedAt().plus(refreshInterval).isAfter(clock.instant()));
	}

	private AppLinkResponse respond(AppLink link) {
		return AppLinkResponse.of(app.enabled(), link, due(link));
	}

	private void releaseQuietly(String linkId, String why) {
		try {
			app.delete(linkId);
		}
		catch (AppApiException e) {
			if (e.kind() != Kind.LINK_NOT_FOUND) {
				logFailure(e, why + " 해제");
			}
		}
	}

	private static void logFailure(AppApiException e, String what) {
		if (e.kind() == Kind.AUTH_FAILED || e.kind() == Kind.NOT_CONFIGURED) {
			log.error("앱 서버 {} 실패: kind={} (APP_LINK_BASE_URL·APP_LINK_SERVICE_KEY 확인)", what, e.kind());
		}
		else {
			log.warn("앱 서버 {} 실패: kind={}", what, e.kind());
		}
	}

	private static ApiException toApi(AppApiException e) {
		return switch (e.kind()) {
			case CODE_INVALID -> new ApiException(ErrorCode.LINK_CODE_INVALID);
			case RATE_LIMITED -> new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, ErrorCode.TOO_MANY_ATTEMPTS.message(),
					Map.of("retryAfterSeconds", e.retryAfterSeconds()));
			case RESULT_UNKNOWN -> new ApiException(ErrorCode.APP_LINK_RESULT_UNKNOWN);
			default -> {
				logFailure(e, "호출");
				yield new ApiException(ErrorCode.APP_UNAVAILABLE);
			}
		};
	}
}
