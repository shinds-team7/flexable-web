package com.flexable.web.goalscenario;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 미리 만든 유형 해설(V39 goal_scenario_type_roles, policies §7-6, #417). 회원 정보 없이 모든 회원이 같이 쓴다.
 * 행은 (프롬프트 버전, 유형, 자료 지문)마다 하나이고, 자료가 바뀌면 지문이 바뀌어 새 행이 생긴다.
 */
@Repository
class TypeRoleStore {
	/** worker가 이 기간 동안 지금 자료에 맞는다고 확인하지 않은 행은 지운다. */
	static final Duration KEEP = Duration.ofDays(14);
	/** basis 안에서 요청 때 그 시나리오의 비중(정수)으로 바꾸는 자리. 숫자가 없어 문장 검사에 걸리지 않는다. */
	static final String WEIGHT = "{비중}";

	/** 유형 해설 세 칸. basis에는 WEIGHT 자리가 하나 있다. */
	record Role(String reason, String basis, String outlook) {
		/** 비중을 채운 세 칸. */
		List<String> filled(int weight) {
			return List.of(reason, basis.replace(WEIGHT, Integer.toString(weight)), outlook);
		}
	}

	private final JdbcTemplate jdbc;
	private final Clock clock;

	TypeRoleStore(JdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	Optional<Role> find(String promptVersion, ProductType type, String fingerprint) {
		List<Role> rows = jdbc.query("SELECT reason, basis, outlook FROM goal_scenario_type_roles WHERE prompt_version = ? AND product_type = ? AND fingerprint = ?",
				(rs, i) -> new Role(rs.getString(1), rs.getString(2), rs.getString(3)), promptVersion, type.name(), fingerprint);
		return rows.stream().findFirst();
	}

	/** 지금 자료에 맞는 행이 있으면 확인 시각을 고치고 true. */
	boolean touch(String promptVersion, ProductType type, String fingerprint) {
		return jdbc.update("UPDATE goal_scenario_type_roles SET last_seen_at = ? WHERE prompt_version = ? AND product_type = ? AND fingerprint = ?",
				Timestamp.from(clock.instant()), promptVersion, type.name(), fingerprint) > 0;
	}

	/** 같은 행이 이미 있으면(동시에 만든 경우) 먼저 들어간 것을 둔다. */
	void save(String promptVersion, ProductType type, String fingerprint, Role role, String model) {
		Timestamp now = Timestamp.from(clock.instant());
		jdbc.update("INSERT INTO goal_scenario_type_roles (prompt_version, product_type, fingerprint, reason, basis, outlook, model, created_at, last_seen_at) "
				+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_seen_at = last_seen_at",
				promptVersion, type.name(), fingerprint, role.reason(), role.basis(), role.outlook(), model, now, now);
	}

	int deleteUnseen() {
		return jdbc.update("DELETE FROM goal_scenario_type_roles WHERE last_seen_at < ?", Timestamp.from(clock.instant().minus(KEEP)));
	}
}
