package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class GoalScenarioAiPropertiesTest {

	@Test
	void 무료는_하루_5회_플러스는_10회() {
		GoalScenarioAiProperties props = new GoalScenarioAiProperties(null, null, null, null);
		assertThat(props.dailyLimit(ScenarioAiQuota.Plan.FREE)).isEqualTo(5);
		assertThat(props.dailyLimit(ScenarioAiQuota.Plan.PLUS)).isEqualTo(10);
		assertThat(props.dailyCap()).isEqualTo(300);
		assertThat(props.logRejected()).isFalse();
	}

	@Test
	void 음수_한도는_거부() {
		assertThatThrownBy(() -> new GoalScenarioAiProperties(3, -1, 300, false)).isInstanceOf(IllegalArgumentException.class);
	}
}
