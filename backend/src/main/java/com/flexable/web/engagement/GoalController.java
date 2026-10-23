package com.flexable.web.engagement;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

import com.flexable.web.engagement.GoalDtos.CoachResponse;
import com.flexable.web.engagement.GoalDtos.GoalInput;
import com.flexable.web.engagement.GoalDtos.GoalResponse;

@RestController
@RequestMapping("/api/v1/me/goal")
public class GoalController {
	private final GoalService goals;

	public GoalController(GoalService goals) {
		this.goals = goals;
	}

	@GetMapping
	GoalResponse get(@AuthenticationPrincipal Jwt jwt) {
		return goals.get(Long.parseLong(jwt.getSubject()));
	}

	@PutMapping
	GoalResponse put(@AuthenticationPrincipal Jwt jwt, @RequestBody GoalInput input) {
		return goals.put(Long.parseLong(jwt.getSubject()), input);
	}

	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt) {
		goals.delete(Long.parseLong(jwt.getSubject()));
	}

	@PostMapping("/coach")
	CoachResponse coach(@AuthenticationPrincipal Jwt jwt) {
		return goals.coach(Long.parseLong(jwt.getSubject()));
	}
}
