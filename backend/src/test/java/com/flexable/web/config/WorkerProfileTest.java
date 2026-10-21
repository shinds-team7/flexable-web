package com.flexable.web.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.context.WebApplicationContext;

/** worker 프로필은 HTTP 없이 뜬다(04 §8). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("worker")
class WorkerProfileTest {

	@Autowired
	ApplicationContext context;

	@Test
	void startsWithoutWebLayer() {
		assertThat(context).isNotInstanceOf(WebApplicationContext.class);
		assertThat(context.getBeanNamesForType(SecurityFilterChain.class)).isEmpty();
	}
}
