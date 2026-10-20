package com.flexable.web.member;

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
import com.flexable.web.member.MemberDtos.MemberResponse;
import com.flexable.web.member.MemberDtos.SettingsPatch;
import com.flexable.web.member.MemberDtos.SettingsResponse;

/** member 패키지의 공개 입구. 다른 패키지는 Member·Repository 대신 이 서비스만 쓴다. */
@Service
public class MemberService {

	private final MemberRepository members;
	private final MemberSettingsRepository settings;
	/** auth처럼 member에 의존하는 쪽이 구현하므로 순환을 피해 부를 때 찾는다. */
	private final ObjectProvider<MemberWithdrawalListener> withdrawalListeners;
	private final Clock clock;

	public MemberService(MemberRepository members, MemberSettingsRepository settings,
			ObjectProvider<MemberWithdrawalListener> withdrawalListeners, Clock clock) {
		this.members = members;
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
		if (members.existsByEmail(normalized)) {
			throw new ApiException(ErrorCode.EMAIL_UNAVAILABLE);
		}
		Member member;
		try {
			member = members.saveAndFlush(new Member(normalized, agreedAt));
		}
		catch (DataIntegrityViolationException e) {
			throw new ApiException(ErrorCode.EMAIL_UNAVAILABLE);
		}
		settings.save(new MemberSettings(member.getId(), agreedAt));
		return member.getId();
	}

	@Transactional(readOnly = true)
	public Optional<Long> findIdByEmail(String email) {
		return members.findByEmail(normalizeEmail(email)).map(Member::getId);
	}

	@Transactional(readOnly = true)
	public MemberResponse profile(long memberId) {
		return MemberResponse.of(find(memberId));
	}

	@Transactional(readOnly = true)
	public SettingsResponse settings(long memberId) {
		return SettingsResponse.of(settings.findById(memberId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED)));
	}

	@Transactional
	public SettingsResponse updateSettings(long memberId, SettingsPatch patch) {
		MemberSettings s = settings.findWithLockByMemberId(memberId)
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
	public void withdraw(long memberId) {
		withdrawalListeners.orderedStream().forEach(l -> l.onWithdraw(memberId));
		settings.deleteById(memberId);
		members.deleteById(memberId);
	}

	private Member find(long memberId) {
		return members.findById(memberId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
	}
}
