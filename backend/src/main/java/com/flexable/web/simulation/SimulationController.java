package com.flexable.web.simulation;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.simulation.SimulationDtos.RunRequest;
import com.flexable.web.simulation.SimulationDtos.RunResponse;

import jakarta.validation.Valid;

/** 공개 API(03 §8-1). 비로그인 무료 한도: 종목 3개. */
@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

	private final SimulationService service;

	public SimulationController(SimulationService service) {
		this.service = service;
	}

	@PostMapping("/run")
	RunResponse run(@Valid @RequestBody RunRequest req) {
		return service.run(req);
	}
}
