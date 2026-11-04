package com.flexable.web.ingest.gemini;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.VirtualSimWriter;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimSample.Draft;

/**
 * Gemini API로 가상 회사·사건 글을 묶어서 쓴다(decisions/2026-11-04-virtual-simulation 4). 응답은 JSON 배열 [{id, name, intro, events:[{code, body}]}].
 * 보내는 것: 업종 이름과 사건 유형의 코드·이름·화면 제목뿐이다(뉴스·실제 공시 원문·실제 회사명·등락 통계·회원 정보 없음).
 * 사건 제목은 AI가 쓰지 않고 서버가 붙인다. 숫자·가격·등락·날짜는 AI가 정하지 않는다. 호출·키 가리기는 GeminiClient가 하고 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
public class GeminiVirtualSimWriter implements VirtualSimWriter {

	static final String PROMPT_VERSION = "vsim-prompt-v2";

	static final String INSTRUCTION = """
			너는 투자 공부용 퀴즈에 쓸 가상의 회사를 만드는 작가다. 입력 배열의 항목마다 실제로 없는 가상 회사 하나를 만든다.
			- name: 한글만 2~10자, 띄어쓰기 없이. 실제 회사·그룹·브랜드 이름(삼성, 현대, 엘지, 에스케이, 롯데, 한화, 포스코, 카카오, 네이버, 씨제이, 신세계, 두산 등)이나 그것으로 시작하거나 비슷한 이름을 쓰지 않는다.
			- intro: 그 업종(industry)에서 무엇을 하는 회사인지 한 문장(15~60자)으로 쓴다.
			- events: 입력 types의 code마다 하나씩, 그 회사가 그 공시 제목(title)에 해당하는 일을 결정하거나 밝혔다는 공시 내용을 3~4문장(80~220자)으로 자세히 쓴다. 무엇을 결정했는지, 상대나 대상(가상의 거래처·기관이 아닌 일반 명사, 예: 국내 완성차 업체), 어떤 절차(이사회 결의, 주주총회 승인, 계약 체결 등)를 거치는지, 무엇에 쓰거나 어떻게 진행되는지 같은 중립 사실을 차례로 쓴다. 첫 문장에 유형 이름(name)의 핵심 낱말(예: 공급 계약, 배당, 유상증자, 자기주식 취득, 최대주주)을 넣는다.
			- 숫자(0~9)·영문자·금액·규모·날짜·비율을 쓰지 않는다. 업종 이름의 숫자는 한글로 바꿔 쓴다(2차전지 → 이차전지). 한글과 마침표·쉼표만 쓴다.
			- 늘었다·줄었다·증가·감소·최대·최저·대규모·호조·부진·개선·악화·흑자·적자처럼 좋고 나쁨이나 크기를 말하는 낱말, 주가·증시·상승·하락처럼 주가 반응을 말하는 낱말을 쓰지 않는다.
			- 원인(때문, 덕분, 영향, 이유), 전망·예상·예측·기대·우려·앞으로·향후·가능성, 사거나 팔라는 말(매수, 매도), 추천을 쓰지 않는다. 일정은 "예정이에요"처럼 쓴다.
			- 실존 인물·기관(금융감독원, 한국거래소, 한국은행 등)·해외 기업 이름, 대표이사·회장·사장 같은 직함을 쓰지 않는다.
			- "~했어요"체로 쓰고 이모지·따옴표를 쓰지 않는다. 입력의 id와 code를 그대로 돌려준다.
			""";

	static final Map<String, Object> SCHEMA = Map.of("type", "ARRAY", "items", Map.of("type", "OBJECT",
			"properties", Map.of(
					"id", Map.of("type", "INTEGER"),
					"name", Map.of("type", "STRING"),
					"intro", Map.of("type", "STRING"),
					"events", Map.of("type", "ARRAY", "items", Map.of("type", "OBJECT",
							"properties", Map.of("code", Map.of("type", "STRING"), "body", Map.of("type", "STRING")),
							"required", List.of("code", "body")))),
			"required", List.of("id", "name", "intro", "events")));

	private final GeminiClient gemini;

	public GeminiVirtualSimWriter(RestClient http, String baseUrl, String apiKey, String model) {
		this.gemini = new GeminiClient(http, baseUrl, apiKey, model);
	}

	@Override
	public boolean enabled() {
		return gemini.enabled();
	}

	@Override
	public String model() {
		return gemini.model();
	}

	@Override
	public String promptVersion() {
		return PROMPT_VERSION;
	}

	@Override
	public List<Written> write(List<Request> batch) {
		if (!enabled()) {
			throw new IllegalStateException("VIRTUAL_SIM_GEMINI_API_KEY·GEMINI_API_KEY가 비어 있어요");
		}
		if (batch.isEmpty()) {
			return List.of();
		}
		Map<Integer, Request> byId = new LinkedHashMap<>();
		List<Map<String, Object>> input = new ArrayList<>();
		for (Request r : batch) {
			byId.put(r.id(), r);
			input.add(request(r));
		}
		String reply = gemini.generate(INSTRUCTION, GeminiClient.toJson(input), SCHEMA);
		return parse(reply, byId);
	}

	/** 회사 하나의 요청 값: id·업종·사건 유형(코드·이름·화면 제목) */
	static Map<String, Object> request(Request r) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("id", r.id());
		m.put("industry", r.industry());
		m.put("types", r.categories().stream().map(c -> Map.of("code", c.name(), "name", c.displayName(), "title", c.titles().getFirst())).toList());
		return m;
	}

	/** 응답을 요청 id에 맞춰 읽는다. 모르는 id·요청하지 않은 유형은 버리고, 같은 id가 두 번 오면 처음 것만 쓴다 */
	static List<Written> parse(String reply, Map<Integer, Request> byId) {
		Map<Integer, Request> pending = new LinkedHashMap<>(byId);
		List<Written> out = new ArrayList<>();
		for (Map<?, ?> row : GeminiClient.parseRows(reply)) {
			if (!(row.get("id") instanceof Number n) || !pending.containsKey(n.intValue())) {
				continue;
			}
			Request r = pending.remove(n.intValue());
			Map<VirtualSimCategory, String> bodies = new EnumMap<>(VirtualSimCategory.class);
			if (row.get("events") instanceof List<?> events) {
				for (Object o : events) {
					if (o instanceof Map<?, ?> e && e.get("code") instanceof String code && e.get("body") instanceof String body) {
						r.categories().stream().filter(c -> c.name().equals(code.strip())).findFirst().ifPresent(c -> bodies.putIfAbsent(c, body.strip()));
					}
				}
			}
			String name = row.get("name") instanceof String s ? s.strip() : null;
			String intro = row.get("intro") instanceof String s ? s.strip() : null;
			out.add(new Written(r.id(), new Draft(name, r.industry(), intro, bodies)));
		}
		return out;
	}
}
