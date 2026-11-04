package com.flexable.web.goalscenario;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** F7 v2 목표 달성 시나리오(로그인 없이, 회원이면 AI 조합). docs/policies.md §7 */
@RestController
@RequestMapping("/api/v1/goal")
public class GoalScenarioController {

	private final GoalScenarioService scenarios;

	public GoalScenarioController(GoalScenarioService scenarios) {
		this.scenarios = scenarios;
	}

	@PostMapping("/scenarios")
	GoalScenarioDtos.Result scenarios(@AuthenticationPrincipal Jwt jwt, @RequestBody GoalScenarioDtos.Request request) {
		// 로그인 없이도 쓴다. 토큰이 있으면 회원으로 보고 AI 조합을 준다(§7-6)
		return scenarios.calculate(request, jwt == null ? null : Long.parseLong(jwt.getSubject()));
	}
}
