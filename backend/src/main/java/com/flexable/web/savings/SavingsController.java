package com.flexable.web.savings;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.savings.SavingsDtos.ProductDetail;
import com.flexable.web.savings.SavingsDtos.ProductList;
import com.flexable.web.savings.SavingsDtos.SimulateRequest;
import com.flexable.web.savings.SavingsDtos.Simulation;

import jakarta.validation.Valid;

/** 적금 비교(로그인 없이 체험 가능). 공시 데이터는 로컬 DB에서만 읽는다. */
@RestController
@RequestMapping("/api/v1/savings")
public class SavingsController {

	private final SavingsService savings;

	public SavingsController(SavingsService savings) {
		this.savings = savings;
	}

	@GetMapping("/products")
	ProductList products(@RequestParam long monthly, @RequestParam int termMonths,
			@RequestParam(defaultValue = "BASE_RATE") String sort, @RequestParam(defaultValue = "DESC") String direction,
			@RequestParam(defaultValue = "FIXED") String reserveType,
			@RequestParam(defaultValue = "BANK,SAVINGS_BANK") List<String> sectors,
			@RequestParam(defaultValue = "") List<String> companies, @RequestParam(defaultValue = "1") int page,
			@RequestParam(defaultValue = "10") int size) {
		return savings.list(monthly, termMonths, sort, direction, reserveType, sectors, companies, page, size);
	}

	@GetMapping("/companies")
	List<SavingsDtos.Company> companies() {
		return savings.companies();
	}

	@GetMapping("/policies")
	List<SavingsDtos.Policy> policies(@RequestParam(defaultValue = "") List<String> ids) {
		return savings.policies(ids);
	}

	@GetMapping("/products/{id}")
	ProductDetail product(@PathVariable String id, @RequestParam int termMonths,
			@RequestParam(defaultValue = "FIXED") String reserveType) {
		return savings.detail(id, termMonths, reserveType);
	}

	@PostMapping("/simulate")
	Simulation simulate(@Valid @RequestBody SimulateRequest request) {
		return savings.simulate(request);
	}
}
