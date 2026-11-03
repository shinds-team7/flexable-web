package com.flexable.web.goalscenario;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** F7 v2 목표 달성 시나리오(로그인 없이). docs/policies.md §7 */
@RestController
@RequestMapping("/api/v1/goal")
public class GoalScenarioController {

	private final GoalScenarioService scenarios;

	public GoalScenarioController(GoalScenarioService scenarios) {
		this.scenarios = scenarios;
	}

	@PostMapping("/scenarios")
	GoalScenarioDtos.Result scenarios(@RequestBody GoalScenarioDtos.Request request) {
		return scenarios.calculate(request);
	}
}
