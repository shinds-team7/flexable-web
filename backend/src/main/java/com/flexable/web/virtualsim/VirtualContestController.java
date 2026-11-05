package com.flexable.web.virtualsim;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.virtualsim.VirtualContestDtos.Answers;
import com.flexable.web.virtualsim.VirtualContestDtos.Contest;
import com.flexable.web.virtualsim.VirtualContestDtos.Mine;
import com.flexable.web.virtualsim.VirtualContestDtos.Placement;
import com.flexable.web.virtualsim.VirtualContestDtos.PlacementResult;
import com.flexable.web.virtualsim.VirtualContestDtos.Ranking;
import com.flexable.web.virtualsim.VirtualContestDtos.RoundStart;
import com.flexable.web.virtualsim.VirtualContestDtos.RoundStarted;

/**
 * 가상 시뮬레이션 대회(policies §8-8). 대회 안내만 로그인 없이 보이고, 나머지는 회원만(비회원 401, SecurityConfig). 응답은 모두 no-store.
 * 판 진행은 /virtual-sim/state·step·decision·end를 그대로 쓴다.
 */
@RestController
@RequestMapping("/api/v1")
public class VirtualContestController {

	private static final String CONTEST_ID = "^[0-9]{4}-(0[1-9]|1[0-2])$";

	private final VirtualContestService service;

	public VirtualContestController(VirtualContestService service) {
		this.service = service;
	}

	private static <T> ResponseEntity<T> response(T body) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}

	private static long user(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	@GetMapping("/virtual-sim/contests/current")
	public ResponseEntity<Contest> current() {
		return response(service.current());
	}

	@PostMapping("/virtual-sim/contests/current/placement")
	public ResponseEntity<Placement> placement(@AuthenticationPrincipal Jwt jwt) {
		return response(service.startPlacement(user(jwt)));
	}

	@PostMapping("/virtual-sim/contests/current/placement/answers")
	public ResponseEntity<PlacementResult> answers(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Answers input) {
		return response(service.answer(user(jwt), input));
	}

	@PostMapping("/virtual-sim/contests/current/rounds")
	public ResponseEntity<RoundStarted> round(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RoundStart input) {
		return response(service.startRound(user(jwt), input.startId()));
	}

	@GetMapping("/virtual-sim/contests/{contestId}/boards/{board}/ranking")
	public ResponseEntity<Ranking> ranking(@AuthenticationPrincipal Jwt jwt, @PathVariable String contestId, @PathVariable String board) {
		if (!contestId.matches(CONTEST_ID)) {
			throw ApiException.invalid("contestId", "대회 이름을 확인해 주세요");
		}
		VirtualContestBoard b;
		try {
			b = VirtualContestBoard.valueOf(board);
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(ErrorCode.VALIDATION_FAILED, "판을 확인해 주세요");
		}
		return response(service.ranking(user(jwt), contestId, b));
	}

	@GetMapping("/me/virtual-sim/contests")
	public ResponseEntity<Mine> mine(@AuthenticationPrincipal Jwt jwt) {
		return response(service.mine(user(jwt)));
	}
}
