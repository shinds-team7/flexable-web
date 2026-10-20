package com.flexable.web.member;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "member_settings")
public class MemberSettings {

	static final String DEFAULT_THEME = "light";
	/** seen_tours(VARCHAR 1000)에 들어가는 최대 개수. 키 40자 + 쉼표 기준 */
	static final int MAX_SEEN_TOURS = 24;

	@Id
	@Column(name = "member_id")
	private Long memberId;

	@Column(nullable = false, length = 10)
	private String theme;

	/** 본 안내 키를 쉼표로 이어 저장한다. 순서는 처음 본 순서. */
	@Column(name = "seen_tours", nullable = false, length = 1000)
	private String seenTours;

	@Column(name = "disclaimer_ack_at")
	private Instant disclaimerAckAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected MemberSettings() {
	}

	MemberSettings(long memberId, Instant now) {
		this.memberId = memberId;
		this.theme = DEFAULT_THEME;
		this.seenTours = "";
		this.updatedAt = now;
	}

	String getTheme() {
		return theme;
	}

	List<String> getSeenTours() {
		return seenTours.isEmpty() ? List.of() : List.of(seenTours.split(","));
	}

	Instant getDisclaimerAckAt() {
		return disclaimerAckAt;
	}

	void changeTheme(String theme, Instant now) {
		this.theme = theme;
		this.updatedAt = now;
	}

	/** 이미 본 키에 더한다(병합). 합쳐서 한도를 넘으면 false를 돌려주고 바꾸지 않는다. */
	boolean addSeenTours(Collection<String> keys, Instant now) {
		Set<String> merged = new LinkedHashSet<>(getSeenTours());
		merged.addAll(keys);
		if (merged.size() > MAX_SEEN_TOURS) {
			return false;
		}
		this.seenTours = String.join(",", merged);
		this.updatedAt = now;
		return true;
	}

	void acknowledgeDisclaimer(Instant now) {
		this.disclaimerAckAt = now;
		this.updatedAt = now;
	}
}
