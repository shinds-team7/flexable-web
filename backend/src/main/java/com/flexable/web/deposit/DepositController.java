package com.flexable.web.deposit;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.deposit.DepositDtos.ProductDetail;
import com.flexable.web.deposit.DepositDtos.ProductList;
import com.flexable.web.deposit.DepositDtos.SimulateRequest;
import com.flexable.web.deposit.DepositDtos.Simulation;

import jakarta.validation.Valid;

/** 정기예금 비교(로그인 없이 체험 가능). 공시 데이터는 로컬 DB에서만 읽는다. */
@RestController
@RequestMapping("/api/v1/deposit")
public class DepositController {

	private final DepositService deposit;

	public DepositController(DepositService deposit) {
		this.deposit = deposit;
	}

	@GetMapping("/products")
	ProductList products(@RequestParam long amount, @RequestParam int termMonths,
			@RequestParam(defaultValue = "BASE_RATE") String sort, @RequestParam(defaultValue = "DESC") String direction,
			@RequestParam(required = false) String interestType,
			@RequestParam(defaultValue = "BANK,SAVINGS_BANK") List<String> sectors,
			@RequestParam(defaultValue = "") List<String> companies, @RequestParam(defaultValue = "1") int page,
			@RequestParam(defaultValue = "10") int size) {
		return deposit.list(amount, termMonths, sort, direction, interestType, sectors, companies, page, size);
	}

	@GetMapping("/companies")
	List<DepositDtos.Company> companies() {
		return deposit.companies();
	}

	@GetMapping("/products/{id}")
	ProductDetail product(@PathVariable String id, @RequestParam int termMonths,
			@RequestParam(required = false) String interestType) {
		return deposit.detail(id, termMonths, interestType);
	}

	@PostMapping("/simulate")
	Simulation simulate(@Valid @RequestBody SimulateRequest request) {
		return deposit.simulate(request);
	}
}
