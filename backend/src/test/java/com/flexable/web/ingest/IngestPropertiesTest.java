package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** 사건 AI 개요 키·모델: 전용 값이 있으면 그것을, 비어 있으면 소식 요약(Gemini)과 같은 값을 쓴다. */
class IngestPropertiesTest {

	private static final IngestProperties.Gemini SHARED = new IngestProperties.Gemini(null, "shared-key", "shared-model", null, null, null);

	@Test
	void 전용_키가_없으면_공용_키를_쓴다() {
		IngestProperties.EventOverview none = new IngestProperties.EventOverview(null, null, null, null, null, null);
		assertThat(none.apiKeyOr(SHARED)).isEqualTo("shared-key");
		assertThat(none.modelOr(SHARED)).isEqualTo("shared-model");
		assertThat(none.maxCalls()).isEqualTo(30);
		assertThat(none.dailyCap()).isEqualTo(100);
		IngestProperties.EventOverview blank = new IngestProperties.EventOverview(null, " ", "", null, null, null);
		assertThat(blank.apiKeyOr(SHARED)).isEqualTo("shared-key");
		assertThat(blank.modelOr(SHARED)).isEqualTo("shared-model");
	}

	@Test
	void 전용_키가_있으면_그것을_쓴다() {
		IngestProperties.EventOverview own = new IngestProperties.EventOverview("gemini", "event-key", "event-model", null, null, null);
		assertThat(own.apiKeyOr(SHARED)).isEqualTo("event-key");
		assertThat(own.modelOr(SHARED)).isEqualTo("event-model");
	}

	@Test
	void 가상_시뮬레이션_상한은_1_이상이어야_한다() {
		assertThat(new IngestProperties.VirtualSim(null, null, null, null, null, null, null).batchSize()).isEqualTo(5);
		for (int i = 0; i < 4; i++) {
			Integer[] v = { 5, 2, 2, 2000 };
			v[i] = 0;
			Integer[] values = v;
			assertThatThrownBy(() -> new IngestProperties.VirtualSim("gemini", null, null, values[0], values[1], values[2], values[3]))
				.isInstanceOf(IllegalArgumentException.class).hasMessageContaining("VIRTUAL_SIM_");
		}
	}
}
