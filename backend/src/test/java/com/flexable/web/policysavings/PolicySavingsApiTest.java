package com.flexable.web.policysavings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class PolicySavingsApiTest {

	@Autowired
	MockMvc mvc;

	private static final String BODY = """
			{"joinDate":"2026-08-20","monthly":500000,"type":"PREFERRED","baseRate":5.0,"bonusRate":3.0}""";

	@Test
	void 규칙은_로그인_없이_UNVERIFIED로_내려간다() throws Exception {
		mvc.perform(get("/api/v1/savings/policy/YOUTH_FUTURE")).andExpect(status().isOk())
				.andExpect(jsonPath("$.code").value("YOUTH_FUTURE"))
				.andExpect(jsonPath("$.verificationStatus").value("UNVERIFIED"))
				.andExpect(jsonPath("$.contributionRates.PREFERRED").value(12))
				.andExpect(jsonPath("$.maxMonthly").value(500000));
	}

	@Test
	void 만기_계산은_정책_예시와_같다() throws Exception {
		mvc.perform(post("/api/v1/savings/policy/YOUTH_FUTURE/simulate").contentType(MediaType.APPLICATION_JSON)
				.content(BODY)).andExpect(status().isOk()).andExpect(jsonPath("$.maturityDate").value("2029-08-20"))
				.andExpect(jsonPath("$.ownInterest").value(2221571))
				.andExpect(jsonPath("$.contributionInterest").value(163512))
				.andExpect(jsonPath("$.total").value(22545083))
				.andExpect(jsonPath("$.averageSavingsComparison").doesNotExist())
				.andExpect(jsonPath("$.verificationStatus").value("UNVERIFIED"));
	}

	@Test
	void 월_납입_한도를_넘으면_400() throws Exception {
		mvc.perform(post("/api/v1/savings/policy/YOUTH_FUTURE/simulate").contentType(MediaType.APPLICATION_JSON)
				.content(BODY.replace("500000", "500001"))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fields.monthly").exists());
	}

	@Test
	void 모르는_코드는_404() throws Exception {
		mvc.perform(get("/api/v1/savings/policy/UNKNOWN")).andExpect(status().isNotFound());
		mvc.perform(post("/api/v1/savings/policy/UNKNOWN/simulate").contentType(MediaType.APPLICATION_JSON)
				.content(BODY)).andExpect(status().isNotFound());
	}
}
