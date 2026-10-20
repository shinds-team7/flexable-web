package com.flexable.web.member;

import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.web.common.Times;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class MemberDtos {

	private MemberDtos() {
	}

	public record MemberResponse(long id, String email, OffsetDateTime createdAt) {

		static MemberResponse of(Member m) {
			return new MemberResponse(m.getId(), m.getEmail(), Times.at(m.getCreatedAt()));
		}
	}

	public record SettingsResponse(String theme, List<String> seenTours, OffsetDateTime disclaimerAckAt) {

		static SettingsResponse of(MemberSettings s) {
			return new SettingsResponse(s.getTheme(), s.getSeenTours(), Times.at(s.getDisclaimerAckAt()));
		}
	}

	/**
	 * 보낸 필드만 바꾼다. seenTours는 이미 본 목록에 더하고(병합), disclaimerAck=true면 서버 시각으로 확인 시각을 남긴다.
	 */
	public record SettingsPatch(
			@Pattern(regexp = "light|dark", message = "테마는 light 또는 dark만 쓸 수 있어요") String theme,
			@Size(max = MemberSettings.MAX_SEEN_TOURS, message = "안내 키가 너무 많아요") List<@Pattern(regexp = "[a-z0-9][a-z0-9-]{0,39}", message = "안내 키 형식을 확인해 주세요") String> seenTours,
			Boolean disclaimerAck) {
	}
}
