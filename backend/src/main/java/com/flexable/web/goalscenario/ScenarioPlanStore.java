package com.flexable.web.goalscenario;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 기한마다 미리 만든 AI 조합(V40 goal_scenario_plans, policies §7-6, #431). 회원 정보 없이 모든 회원이 같이 쓴다.
 * 행은 (프롬프트 버전, 기한, 자료 지문)마다 하나이고, 자료가 바뀌면 지문이 바뀌어 새 행이 생긴다.
 */
@Repository
class ScenarioPlanStore {
	/** worker가 이 기간 동안 지금 자료에 맞는다고 확인하지 않은 행은 지운다. */
	static final Duration KEEP = Duration.ofDays(14);
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final JdbcTemplate jdbc;
	private final Clock clock;

	ScenarioPlanStore(JdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/** 저장된 조합과 만든 모델. */
	record Stored(List<Proposals.Draft> drafts, String model) {
	}

	Optional<Stored> find(String promptVersion, int months, String fingerprint) {
		List<Stored> rows = jdbc.query("SELECT drafts, model FROM goal_scenario_plans WHERE prompt_version = ? AND months = ? AND fingerprint = ?",
				(rs, i) -> new Stored(read(rs.getString(1)), rs.getString(2)), promptVersion, months, fingerprint);
		return rows.stream().filter(s -> s.drafts() != null).findFirst();
	}

	/** 지금 자료에 맞는 행이 있으면 확인 시각을 고치고 true. */
	boolean touch(String promptVersion, int months, String fingerprint) {
		return jdbc.update("UPDATE goal_scenario_plans SET last_seen_at = ? WHERE prompt_version = ? AND months = ? AND fingerprint = ?",
				Timestamp.from(clock.instant()), promptVersion, months, fingerprint) > 0;
	}

	/** 같은 행이 이미 있으면(동시에 만든 경우) 먼저 들어간 것을 둔다. */
	void save(String promptVersion, int months, String fingerprint, List<Proposals.Draft> drafts, String model) {
		Timestamp now = Timestamp.from(clock.instant());
		jdbc.update("INSERT INTO goal_scenario_plans (prompt_version, months, fingerprint, drafts, model, created_at, last_seen_at) "
				+ "VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_seen_at = last_seen_at",
				promptVersion, months, fingerprint, JSON.writeValueAsString(drafts), model, now, now);
	}

	int deleteUnseen() {
		return jdbc.update("DELETE FROM goal_scenario_plans WHERE last_seen_at < ?", Timestamp.from(clock.instant().minus(KEEP)));
	}

	private static List<Proposals.Draft> read(String json) {
		try {
			return JSON.readValue(json, new TypeReference<List<Proposals.Draft>>() { });
		}
		catch (RuntimeException e) {
			return null;
		}
	}
}
