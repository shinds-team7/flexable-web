package com.flexable.web.user;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.user.UserDtos.UserResponse;
import com.flexable.web.user.UserDtos.SettingsPatch;
import com.flexable.web.user.UserDtos.SettingsResponse;

/** user 패키지의 공개 입구. 다른 패키지는 User·Repository 대신 이 서비스만 쓴다. */
@Service
public class UserService {

	private final UserRepository users;
	private final UserSettingsRepository settings;
	/** auth처럼 user에 의존하는 쪽이 구현하므로 순환을 피해 부를 때 찾는다. */
	private final ObjectProvider<UserWithdrawalListener> withdrawalListeners;
	private final Clock clock;

	public UserService(UserRepository users, UserSettingsRepository settings,
			ObjectProvider<UserWithdrawalListener> withdrawalListeners, Clock clock) {
		this.users = users;
		this.settings = settings;
		this.withdrawalListeners = withdrawalListeners;
		this.clock = clock;
	}

	public static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	/** 약관·개인정보 동의를 받은 가입. 같은 이메일의 웹 회원이 있으면 EMAIL_UNAVAILABLE. */
	@Transactional
	public long register(String email, Instant agreedAt) {
		String normalized = normalizeEmail(email);
		if (users.existsByEmail(normalized)) {
			throw new ApiException(ErrorCode.EMAIL_UNAVAILABLE);
		}
		User user;
		try {
			user = users.saveAndFlush(new User(normalized, agreedAt));
		}
		catch (DataIntegrityViolationException e) {
			throw new ApiException(ErrorCode.EMAIL_UNAVAILABLE);
		}
		settings.save(new UserSettings(user.getId(), agreedAt));
		return user.getId();
	}

	@Transactional(readOnly = true)
	public Optional<Long> findIdByEmail(String email) {
		return users.findByEmail(normalizeEmail(email)).map(User::getId);
	}

	@Transactional(readOnly = true)
	public UserResponse profile(long userId) {
		return UserResponse.of(find(userId));
	}

	@Transactional(readOnly = true)
	public SettingsResponse settings(long userId) {
		return SettingsResponse.of(settings.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED)));
	}

	@Transactional
	public SettingsResponse updateSettings(long userId, SettingsPatch patch) {
		UserSettings s = settings.findWithLockByUserId(userId)
			.orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
		Instant now = clock.instant();
		if (patch.theme() != null) {
			s.changeTheme(patch.theme(), now);
		}
		if (patch.seenTours() != null && !s.addSeenTours(patch.seenTours(), now)) {
			throw ApiException.invalid("seenTours", "본 안내를 더 저장할 수 없어요");
		}
		if (Boolean.TRUE.equals(patch.disclaimerAck())) {
			s.acknowledgeDisclaimer(now);
		}
		return SettingsResponse.of(s);
	}

	/**
	 * 웹 탈퇴. 각 패키지의 웹 데이터를 지운 뒤 회원 행을 지운다. 본인 확인은 부른 쪽(auth)이 끝낸 상태여야 한다.
	 * 앱 연동 해제(applink)는 그 패키지를 만들 때 여기에 더한다(04 §4).
	 */
	@Transactional
	public void withdraw(long userId) {
		withdrawalListeners.orderedStream().forEach(l -> l.onWithdraw(userId));
		settings.deleteById(userId);
		users.deleteById(userId);
	}

	private User find(long userId) {
		return users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
	}
}
