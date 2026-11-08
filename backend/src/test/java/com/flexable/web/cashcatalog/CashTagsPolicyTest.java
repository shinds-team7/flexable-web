package com.flexable.web.cashcatalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §10 표 = tests/policy/cash-tags.json. 낱말 표와 예시가 코드와 맞는지 확인한다. */
class CashTagsPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "cash-tags.json")));
	}

	@Test
	void 낱말_표가_정책_파일과_같다() throws Exception {
		JsonNode keywords = root().get("keywords");
		assertThat(keywords.propertyNames()).containsExactlyElementsOf(CashTags.KEYWORDS.keySet());
		for (var e : CashTags.KEYWORDS.entrySet()) {
			List<String> words = new ArrayList<>();
			keywords.get(e.getKey()).forEach(w -> words.add(w.asString()));
			assertThat(e.getValue()).as(e.getKey()).containsExactlyElementsOf(words);
		}
	}

	@TestFactory
	Stream<DynamicTest> 태그_예시() throws Exception {
		return root().get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			String conditions = c.get("conditions").isNull() ? null : c.get("conditions").asString();
			List<String> expected = new ArrayList<>();
			c.get("expected").forEach(t -> expected.add(t.asString()));
			assertThat(CashTags.of(c.get("productName").asString(), conditions)).containsExactlyElementsOf(expected);
		}));
	}
}
