package com.flexable.web.policysavings;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.policysavings.PolicySavingsService.Rules;
import com.flexable.web.policysavings.PolicySavingsService.SimulateRequest;
import com.flexable.web.policysavings.PolicySavingsService.Simulation;

/** 정책 적금(청년미래적금) 규칙·만기 계산. 로그인 없이 쓴다. */
@RestController
@RequestMapping("/api/v1/savings/policy")
public class PolicySavingsController {

	private final PolicySavingsService service;

	public PolicySavingsController(PolicySavingsService service) {
		this.service = service;
	}

	@GetMapping("/{code}")
	Rules rules(@PathVariable String code) {
		return service.rules(code);
	}

	@PostMapping("/{code}/simulate")
	Simulation simulate(@PathVariable String code, @RequestBody SimulateRequest request) {
		return service.simulate(code, request);
	}
}
