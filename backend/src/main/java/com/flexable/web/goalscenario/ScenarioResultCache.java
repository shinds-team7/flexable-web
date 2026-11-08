package com.flexable.web.goalscenario;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.flexable.web.goalscenario.GoalScenarioDtos.Result;

/**
 * 방금 계산한 결과를 저장할 수 있게 30분 동안만 메모리에 둔다(policies §7-8). 화면이 보낸 숫자를 믿지 않고, AI가 매번 다른 조합을 내도
 * 본 그대로 저장하기 위해서다. 서버를 다시 띄우면 사라지고(그때는 다시 계산), 많아지면 먼저 끝나는 것부터 버린다.
 */
@Component
class ScenarioResultCache {

	static final Duration TTL = Duration.ofMinutes(30);
	static final int MAX = 2000;

	private record Entry(Result result, Instant expiresAt) {
	}

	private final Map<String, Entry> entries = new ConcurrentHashMap<>();
	private final Clock clock;

	ScenarioResultCache(Clock clock) {
		this.clock = clock;
	}

	/** resultId를 붙여 기억하고, 붙인 결과를 돌려준다. */
	Result remember(Result r) {
		Instant now = clock.instant();
		entries.values().removeIf(e -> !e.expiresAt().isAfter(now));
		while (entries.size() >= MAX) {
			entries.entrySet().stream().min(Comparator.comparing(e -> e.getValue().expiresAt()))
				.ifPresent(e -> entries.remove(e.getKey()));
		}
		String id = UUID.randomUUID().toString();
		Result withId = new Result(id, r.name(), r.targetAmount(), r.years(), r.months(), r.proposer(), r.fallbackReason(), r.asOf(),
				r.returnsFrom(), r.returnsTo(), r.paths(), r.seed(), r.reachShare(), r.products(), r.scenarios(), r.assumptions(), r.notice(),
				r.isSample(), r.aiUsage(), r.aiReused());
		entries.put(id, new Entry(withId, now.plus(TTL)));
		return withId;
	}

	/** 30분 안이면 그 결과. 지났거나 없으면 빈 값. */
	Optional<Result> find(String resultId) {
		if (resultId == null) {
			return Optional.empty();
		}
		Entry e = entries.get(resultId);
		if (e == null || !e.expiresAt().isAfter(clock.instant())) {
			return Optional.empty();
		}
		return Optional.of(e.result());
	}
}
