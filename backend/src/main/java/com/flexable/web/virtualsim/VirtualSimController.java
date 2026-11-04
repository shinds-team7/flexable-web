package com.flexable.web.virtualsim;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.practice.PracticeDtos.Command;
import com.flexable.web.practice.PracticeDtos.Token;
import com.flexable.web.virtualsim.VirtualSimDtos.Decision;
import com.flexable.web.virtualsim.VirtualSimDtos.Snapshot;
import com.flexable.web.virtualsim.VirtualSimDtos.Start;
import com.flexable.web.virtualsim.VirtualSimDtos.Started;
import com.flexable.web.virtualsim.VirtualSimDtos.Status;

/** 가상 시뮬레이션(/virtual-sim/*). 응답은 모두 no-store */
@RestController
@RequestMapping("/api/v1/virtual-sim")
public class VirtualSimController {

	private final VirtualSimService service;

	public VirtualSimController(VirtualSimService service) {
		this.service = service;
	}

	private static <T> ResponseEntity<T> response(T body) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}

	@GetMapping("/status")
	public ResponseEntity<Status> status() {
		return response(service.status());
	}

	@PostMapping("/start")
	public ResponseEntity<Started> start(@Valid @RequestBody Start input) {
		return response(service.start(input));
	}

	@PostMapping("/state")
	public ResponseEntity<Snapshot> state(@Valid @RequestBody Token input) {
		return response(service.state(input.sessionToken()));
	}

	@PostMapping("/step")
	public ResponseEntity<Snapshot> step(@Valid @RequestBody Command input) {
		return response(service.step(input));
	}

	@PostMapping("/decision")
	public ResponseEntity<Snapshot> decide(@Valid @RequestBody Decision input) {
		return response(service.decide(input));
	}

	@PostMapping("/end")
	public ResponseEntity<Void> end(@Valid @RequestBody Token input) {
		service.end(input.sessionToken());
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
