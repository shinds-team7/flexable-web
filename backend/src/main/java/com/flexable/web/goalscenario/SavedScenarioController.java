package com.flexable.web.goalscenario;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 저장한 목표 시나리오(회원만, 최대 5개). docs/policies.md §7-8 */
@RestController
@RequestMapping("/api/v1/me/goal/scenarios")
public class SavedScenarioController {

	private final SavedScenarioService saved;

	public SavedScenarioController(SavedScenarioService saved) {
		this.saved = saved;
	}

	@GetMapping
	GoalScenarioDtos.SavedList list(@AuthenticationPrincipal Jwt jwt) {
		return saved.list(Long.parseLong(jwt.getSubject()));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	GoalScenarioDtos.Saved save(@AuthenticationPrincipal Jwt jwt, @RequestBody GoalScenarioDtos.SaveRequest request) {
		return saved.save(Long.parseLong(jwt.getSubject()), request);
	}

	@GetMapping("/{id}")
	GoalScenarioDtos.Saved get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return saved.get(Long.parseLong(jwt.getSubject()), id);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		saved.delete(Long.parseLong(jwt.getSubject()), id);
	}
}
