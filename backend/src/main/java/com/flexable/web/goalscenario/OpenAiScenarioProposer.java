package com.flexable.web.goalscenario;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.flexable.web.ai.GoalScenarioAiClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** OpenAI 응답(JSON)을 제안 초안으로 바꾼다. 규칙 검사는 Proposals.validate가 맡는다. */
@Component
class OpenAiScenarioProposer implements ScenarioProposer {

	private static final JsonMapper JSON = JsonMapper.builder().build();
	private final GoalScenarioAiClient client;

	OpenAiScenarioProposer(GoalScenarioAiClient client) {
		this.client = client;
	}

	@Override
	public boolean enabled() {
		return client.enabled();
	}

	@Override
	public List<Proposals.Draft> propose(Input input) {
		String content;
		try {
			content = client.propose(JSON.writeValueAsString(input)).content();
		}
		catch (GoalScenarioAiClient.Failed e) {
			throw new Failed(e.reason());
		}
		return parse(content);
	}

	/** 형식이 어긋나면 null 칸으로 두어 검증에서 걸리게 한다(AI_REJECTED). JSON이 아니면 Failed. */
	static List<Proposals.Draft> parse(String content) {
		JsonNode root;
		try {
			root = JSON.readTree(content);
		}
		catch (RuntimeException e) {
			throw new Failed("BAD_RESPONSE");
		}
		List<Proposals.Draft> out = new ArrayList<>();
		for (JsonNode s : root.path("scenarios")) {
			Map<String, Integer> mix = new LinkedHashMap<>();
			s.path("mix").properties().forEach(e -> mix.put(e.getKey(), e.getValue().isIntegralNumber() ? e.getValue().asInt() : null));
			out.add(new Proposals.Draft(text(s, "id"), text(s, "title"), text(s, "summary"), explanation(s), mix));
		}
		return out;
	}

	/** 해설 네 칸을 문단으로 합친다. 비어 있는 칸은 건너뛰고, 다 비면 null이라 검증에서 걸린다(TEXT_EMPTY). */
	private static String explanation(JsonNode scenario) {
		List<String> parts = new ArrayList<>();
		for (String field : GoalScenarioAiClient.EXPLANATION_FIELDS) {
			String part = text(scenario, field);
			if (part != null && !part.isBlank()) {
				parts.add(part.strip());
			}
		}
		return parts.isEmpty() ? null : String.join("\n\n", parts);
	}

	private static String text(JsonNode node, String field) {
		JsonNode v = node.path(field);
		return v.isString() ? v.asString() : null;
	}
}
