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
			out.add(new Proposals.Draft(text(s, "id"), text(s, "title"), text(s, "summary"), parts(s), mix));
		}
		return out;
	}

	/** 해설 네 칸을 따로 둔다(합친 문단은 Draft가 만든다). 한 칸이라도 비면 null이라 검증에서 걸린다(TEXT_EMPTY). */
	private static Proposals.Parts parts(JsonNode scenario) {
		List<String> parts = new ArrayList<>();
		for (String field : GoalScenarioAiClient.EXPLANATION_FIELDS) {
			String part = field.equals("roles") && scenario.has(GoalScenarioAiClient.TYPE_ROLES) ? roles(scenario) : text(scenario, field);
			if (part == null || part.isBlank()) {
				return null;
			}
			parts.add(part.strip());
		}
		return new Proposals.Parts(parts.get(0), parts.get(1), parts.get(2), parts.get(3));
	}

	/**
	 * 유형별 칸(typeRoles, v10 #402)을 유형마다 한 줄로 합친다. 비중이 0보다 큰 유형만 ProductType 순서(적금 → CMA → 국내 → 미국 → 코스피)로 넣고,
	 * 빈 칸은 빼며 세 칸이 다 빈 유형은 줄을 뺀다. 칸 안의 줄바꿈은 띄어쓰기로 바꿔 한 유형이 한 문단이 되게 한다.
	 * 모든 유형이 비면 빈 문자열이라 검증에서 걸린다(TEXT_EMPTY).
	 */
	static String roles(JsonNode scenario) {
		JsonNode typeRoles = scenario.path(GoalScenarioAiClient.TYPE_ROLES);
		JsonNode mix = scenario.path("mix");
		List<String> lines = new ArrayList<>();
		for (ProductType type : ProductType.values()) {
			JsonNode ratio = mix.path(type.name());
			if (!ratio.isIntegralNumber() || ratio.asInt() <= 0) {
				continue;
			}
			List<String> sentences = new ArrayList<>();
			for (String field : GoalScenarioAiClient.TYPE_ROLE_FIELDS) {
				String part = text(typeRoles.path(type.name()), field);
				if (part != null && !part.isBlank()) {
					String one = part.replaceAll("\\s*\\n\\s*", " ").strip();
					// 칸 끝에 마침표가 없으면 붙여 다음 칸과 한 문장으로 묶여 지워지지 않게 한다(문장 검사는 마침표·줄바꿈으로 나눈다)
					sentences.add(one.matches(".*[.!?]$") ? one : one + ".");
				}
			}
			if (!sentences.isEmpty()) {
				lines.add(String.join(" ", sentences));
			}
		}
		return String.join("\n", lines);
	}

	private static String text(JsonNode node, String field) {
		JsonNode v = node.path(field);
		return v.isString() ? v.asString() : null;
	}
}
