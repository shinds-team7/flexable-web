package com.flexable.web.ingest.gemini;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.SequencedSet;
import java.util.Set;
import java.util.stream.Stream;

import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.EventOverviewWriter;
import com.flexable.web.market.EventDtos.OverviewInput;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;

/**
 * Gemini API로 사건 AI 개요를 묶어서 쓴다(decisions/2026-10-29-event-ai-summary). 응답은 JSON 배열 [{id, overview}]로 받는다.
 * 보내는 것: 이름·기간·거래일 수·방향·등락률·시장 대비·거래량 배수·DART 공시 제목뿐이다(공개 시장 자료, 회원 정보 없음).
 * 네이버 뉴스 기사는 보내지 않는다(검색 API 특약의 AI 입력 금지). 호출·키 가리기는 GeminiClient가 하고, 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
public class GeminiEventOverviewWriter implements EventOverviewWriter {

	static final int MAX_CHARS = 160;
	static final int MAX_SENTENCES = 3;
	/**
	 * 들어가면 개요를 버리는 말. 원인 단정(공시와 주가를 원인·결과로 잇기), 권유·매매, 전망, 없는 기능 암시(01 §7, 02 §9).
	 * 종목명·공시 제목 안의 글자는 빼고 본다(예: 공시 "공개매수신고서"의 "매수").
	 */
	static final List<String> BANNED = List.of(
			"때문", "덕분", "덕에", "영향", "원인", "이유", "인해", "탓", "호재", "악재", "견인", "이끌", "끌어",
			"추천", "권유", "권해", "매수", "매도", "사세요", "파세요", "사야", "팔아야", "투자하", "투자해", "목표가", "저평가", "고평가",
			"전망", "예상", "예측", "기대", "우려", "앞으로", "향후", "가능성",
			"AI 분석", "AI 추천", "무조건", "반드시", "확실");

	static final String INSTRUCTION = """
			너는 주가가 크게 움직인 지난 사건을 처음 투자를 공부하는 사람에게 짧게 정리하는 편집자다. 입력 배열의 사건마다 한국어 1~3문장(160자 이내)으로 쓴다.
			- 입력에 있는 값(이름·기간·등락률·같은 기간 시장 전체 등락률·거래량 배수·공시 제목)만 쓴다. 숫자는 입력에 적힌 그대로 쓰고(예: +4.2%, 3.1배), 날짜는 "10월 12일"처럼 쓴다. 숫자를 새로 계산하거나 만들지 않는다.
			- 공시가 있으면 "이 기간에 ○○ 공시가 있었어요"처럼 있었던 일로만 쓴다. 공시와 주가를 원인·결과로 잇지 않는다("때문에", "영향으로", "덕분에", "원인", "호재", "악재"를 쓰지 않는다).
			- 공시가 없으면 공시 이야기를 하지 않는다. scope가 MARKET이면 특정 회사가 아닌 시장 전체 움직임으로만 쓴다.
			- 앞으로의 주가, 전망·예상, 사거나 팔라는 말, 추천을 쓰지 않는다.
			- "~했어요"체로 쓰고 이모지·따옴표를 쓰지 않는다. 입력의 id를 그대로 돌려준다.
			""";

	private final GeminiClient gemini;

	public GeminiEventOverviewWriter(RestClient http, String baseUrl, String apiKey, String model) {
		this.gemini = new GeminiClient(http, baseUrl, apiKey, model);
	}

	@Override
	public boolean enabled() {
		return gemini.enabled();
	}

	@Override
	public List<OverviewResult> write(List<OverviewTarget> batch) {
		if (!enabled()) {
			throw new IllegalStateException("GEMINI_API_KEY가 비어 있어요");
		}
		if (batch.isEmpty()) {
			return List.of();
		}
		Map<Long, OverviewTarget> byId = new LinkedHashMap<>();
		List<Map<String, Object>> input = new ArrayList<>();
		for (OverviewTarget t : batch) {
			byId.put(t.input().id(), t);
			input.add(request(t.input()));
		}
		List<OverviewResult> out = new ArrayList<>();
		String reply = gemini.generate(INSTRUCTION, GeminiClient.toJson(input), GeminiClient.idTextSchema("overview"));
		for (Map<?, ?> row : GeminiClient.parseRows(reply)) {
			if (!(row.get("id") instanceof Number n) || !byId.containsKey(n.longValue())) {
				continue;
			}
			OverviewTarget t = byId.remove(n.longValue());
			String text = check(row.get("overview") instanceof String s ? s : null, t.input());
			out.add(new OverviewResult(t.input().id(), t.inputHash(), text, gemini.model(), false));
		}
		return out;
	}

	/** 사건 하나의 요청 값. 비어 있는 칸(시장 대비·거래량 배수·공시)은 넣지 않는다 */
	static Map<String, Object> request(OverviewInput in) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("id", in.id());
		m.put("scope", in.scope());
		m.put("name", in.name());
		m.put("period", in.period());
		m.put("windowDays", in.windowDays());
		m.put("direction", "RISE".equals(in.direction()) ? "올랐음" : "내렸음");
		m.put("returnRate", in.returnRate());
		if (in.marketReturn() != null) {
			m.put("marketReturn", in.marketReturn());
		}
		if (in.volumeRatio() != null) {
			m.put("volumeRatio", in.volumeRatio());
		}
		if (!in.disclosures().isEmpty()) {
			m.put("disclosures", in.disclosures());
		}
		return m;
	}

	/**
	 * 개요 검사. 통과하면 다듬은 문장, 아니면 null(상세에 개요 칸이 보이지 않는다).
	 * 160자·3문장 이내, 금지 표현 없음(종목명·공시 제목 안의 글자는 빼고 본다), 개요에 나온 숫자가 모두 입력에 있어야 한다
	 * (등락률은 적힌 소수 그대로, 날짜는 입력의 "2026년 10월 12일"에서 나온 연·월·일 숫자로, 공시 수는 공시 제목 개수로 맞춘다).
	 */
	public static String check(String text, OverviewInput in) {
		if (text == null) {
			return null;
		}
		String s = text.strip().replaceAll("\\s+", " ");
		if (s.isEmpty() || s.length() > MAX_CHARS || GeminiNewsSummarizer.sentences(s) > MAX_SENTENCES) {
			return null;
		}
		String plain = Stream.concat(Stream.of(in.name()), in.disclosures().stream()).reduce(s, (acc, quoted) -> acc.replace(quoted, " "));
		if (BANNED.stream().anyMatch(plain::contains)) {
			return null;
		}
		Set<String> known = new LinkedHashSet<>();
		List<String> texts = new ArrayList<>(List.of(in.name(), in.period(), in.returnRate(), String.valueOf(in.windowDays()),
				String.valueOf(in.disclosures().size())));
		texts.addAll(in.disclosures());
		Stream.of(in.marketReturn(), in.volumeRatio()).filter(v -> v != null).forEach(texts::add);
		texts.forEach(t -> GeminiNewsSummarizer.numbers(t).forEach(known::addAll));
		for (SequencedSet<String> n : GeminiNewsSummarizer.numbers(s)) {
			if (!known.contains(n.getLast())) {
				return null;
			}
		}
		return s;
	}
}
