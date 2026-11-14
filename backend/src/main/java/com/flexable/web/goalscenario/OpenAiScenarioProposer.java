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
	public String planVersion() {
		return client.planPromptVersion();
	}

	@Override
	public String typeRoleVersion() {
		return client.typeRolePromptVersion();
	}

	@Override
	public List<Proposals.Draft> proposePlan(PlanInput input, Map<ProductType, TypeRoleStore.Role> roles) {
		String content;
		try {
			content = client.plan(JSON.writeValueAsString(input)).content();
		}
		catch (GoalScenarioAiClient.Failed e) {
			throw new Failed(e.reason());
		}
		return parse(content, roles);
	}

	static List<Proposals.Draft> parse(String content) {
		return parse(content, null);
	}

	/**
	 * 형식이 어긋나면 null 칸으로 두어 검증에서 걸리게 한다(AI_REJECTED). JSON이 아니면 Failed.
	 * stored가 있으면(짧은 길, #417) roles 칸은 미리 만든 유형 해설로 만든다.
	 */
	static List<Proposals.Draft> parse(String content, Map<ProductType, TypeRoleStore.Role> stored) {
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
			out.add(new Proposals.Draft(text(s, "id"), text(s, "title"), text(s, "summary"), parts(s, stored), mix));
		}
		return out;
	}

	/** 해설 네 칸을 따로 둔다(합친 문단은 Draft가 만든다). 한 칸이라도 비면 null이라 검증에서 걸린다(TEXT_EMPTY). */
	private static Proposals.Parts parts(JsonNode scenario, Map<ProductType, TypeRoleStore.Role> stored) {
		List<String> parts = new ArrayList<>();
		for (String field : GoalScenarioAiClient.EXPLANATION_FIELDS) {
			String part;
			if (!field.equals("roles")) {
				part = text(scenario, field);
			}
			else if (stored != null) {
				part = roles(scenario.path("mix"), (type, weight) -> stored.containsKey(type) ? stored.get(type).filled(weight) : List.of());
			}
			else if (scenario.has(GoalScenarioAiClient.TYPE_ROLES)) {
				part = roles(scenario);
			}
			else {
				part = text(scenario, field);
			}
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
		return roles(scenario.path("mix"), (type, weight) -> GoalScenarioAiClient.TYPE_ROLE_FIELDS.stream()
			.map(field -> text(typeRoles.path(type.name()), field)).toList());
	}

	/** fields는 유형과 비중을 받아 그 유형의 칸(넣은 이유·근거·전망 순서, null 가능)을 돌려준다. 미리 만든 해설(#417)과 AI 칸이 같은 규칙으로 합쳐진다. */
	static String roles(JsonNode mix, java.util.function.BiFunction<ProductType, Integer, List<String>> fields) {
		List<String> lines = new ArrayList<>();
		for (ProductType type : ProductType.values()) {
			JsonNode ratio = mix.path(type.name());
			if (!ratio.isIntegralNumber() || ratio.asInt() <= 0) {
				continue;
			}
			List<String> sentences = new ArrayList<>();
			for (String part : fields.apply(type, ratio.asInt())) {
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
