package com.flexable.web.ingest.gemini;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.PlacementSummaryWriter;
import com.flexable.web.virtualsim.PlacementDetails;
import com.flexable.web.virtualsim.PlacementSummaries;

/**
 * Gemini API로 배치고사 공시 AI 요약을 묶어서 쓴다(decisions/2026-11-09-placement-ai-summary). 응답은 JSON 배열 [{id, summary}]로 받는다.
 * 보내는 것: 공시 유형 이름·제목·본문 글(표지를 뺀 공개 공시, 공시 하나에 PlacementSummaries.MAX_SOURCE_CHARS자까지)뿐이다. 회사 이름·접수번호·회원 정보는 보내지 않는다.
 * 받은 요약은 PlacementSummaries.check(금지 낱말·로마자·숫자 형식·절대 금액·이름·내용 없음·길이)를 통과해야 쓴다. 걸린 요약은 작업(PlacementSummaryJob)이
 * 까닭과 함께 rewrite로 한 번 더 부른다(draft·problem을 더해 보낸다). 호출·키 가리기는 GeminiClient가 하고, 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
public class GeminiPlacementSummaryWriter implements PlacementSummaryWriter {

	static final String INSTRUCTION = """
			너는 처음 투자를 공부하는 사람에게 한국 상장사의 전자공시가 무엇을 알렸는지 설명하는 편집자다. 입력 배열의 공시마다 본문(text)을 읽고, 그 공시가 알린 핵심 사실을 한국어 2~5문장(350자 이내)으로 쓴다.
			읽는 사람은 이 글만 보고 공시 뒤 주가가 어떻게 움직였을지 스스로 판단한다. 그래서 사실과 수치는 충실히 쓰고, 좋고 나쁨이나 주가에 대한 판단은 쓰지 않는다.

			꼭 쓸 것(본문에 있으면, type에 맞춰):
			- 실적 발표: 매출액·영업이익·순이익이 전년 같은 기간보다 몇 %% 늘었는지 줄었는지, 흑자 전환·적자 전환·적자 지속 여부
			- 공급 계약: 무엇을 공급하는지, 계약 금액이 최근 매출액의 몇 %%인지, 계약 기간 길이
			- 유상증자·무상증자: 새 주식이 기존 주식의 몇 %%인지, 배정 방식, 모은 돈의 용도
			- 사채 발행: 사채 종류, 발행 규모 구간, 주식으로 바뀌면 늘어날 주식의 %%, 이자율
			- 자기주식 취득·처분: 발행 주식 대비 %%, 방법, 목적. 결과 보고서는 결정이 아니라 실행 결과다: 예정 금액(규모 구간)을 다 채웠는지·미달이면 그 까닭, 취득(처분) 뒤 자기주식 보유 비중(%%)
			- 배당: 배당 종류, 시가배당률, 배당금 총액 규모 구간
			- 합병·분할: 방식, 상대 회사와의 관계, 규모 구간
			- 시설·지분 투자: 무엇에 투자하는지, 자기자본 대비 %%, 투자 기간 길이
			- 소송·사고: 무엇에 대한 소송·사건인지, 청구 금액이 자기자본의 몇 %%인지
			- 최대주주 변경: 바뀐 까닭, 새 최대주주의 지분율
			- 그 밖의 공시: 무엇을 알렸는지와 핵심 수치
			"공개되었어요", "안내되었어요", "수치가 담겼어요"처럼 내용 없는 문장은 쓰지 않는다. 그 수치를 직접 쓴다. "몇 %%"처럼 값을 비워 두지 않는다. 본문에서 값을 찾지 못하면 그 문장을 빼고 쓴다.
			본문의 표는 칸을 " | "로 잇고 한 행이 한 줄이다. 첫 줄들의 칸 이름과 값의 자리를 맞춰 읽는다.

			쓰는 방법:
			- 사업 지표의 변화는 "늘었어요", "줄었어요", "증가", "감소", "흑자 전환", "적자 전환"으로 쓴다. "상승·하락·오르다·내리다·떨어지다"는 쓰지 않는다(주가를 떠올리게 한다). 결정은 "결정했어요"로 쓴다.
			- 숫자는 %% 값과 기간 길이(예: 18개월, 2년간)만 쓴다. %% 값은 본문에 적힌 값을 그대로 쓰거나 소수 자리만 버린다. 반올림하거나 새로 계산하지 않는다.
			- 금액은 다음 규모 구간 이름 중 하나를 그대로 쓴다: %s. 주식 수는 기존 대비 %%로만 쓴다.
			- 연도·날짜·분기 번호(3분기 대신 "이번 분기"), 회차(제12회), 주당 금액, 절대 금액·주식 수를 숫자로 쓰지 않는다. "제3자배정"은 써도 된다.
			- 회사·계열사·거래 상대방·사람 이름을 쓰지 않는다("이 회사", "상대 회사", "한 개인"으로 쓴다). 영어·로마자를 쓰지 않는다(제품·사업 이름은 우리말로 풀어 쓴다).
			- 호재·악재·좋은 소식·나쁜 소식·긍정적·부정적·유리·불리·기대·우려, 주가, 전망·예상·앞으로, 이런 공시 뒤 보통 어떻게 되는지 같은 과거 경향, 사거나 팔라는 말을 쓰지 않는다. "비율"이라는 낱말 대신 "몇 %%"로 쓴다.
			- 본문에 없는 내용을 지어내지 않는다.
			- "~했어요"·"~예요"체로 쓰고 이모지·따옴표를 쓰지 않는다. 입력의 id를 그대로 돌려준다.
			""".formatted(String.join(", ", PlacementDetails.bucketNames()));
	/** 다시 쓰기: 같은 지시에 draft(앞서 쓴 글)와 problem(걸린 까닭)을 더한다 */
	static final String REWRITE = INSTRUCTION + """

			이번 요청은 다시 쓰기다. 각 항목의 draft는 앞서 쓴 글이고 problem은 규칙에 걸린 까닭이다. problem을 고치고 위 규칙을 모두 지켜 summary를 새로 쓴다.
			""";

	private final GeminiClient gemini;

	public GeminiPlacementSummaryWriter(RestClient http, String baseUrl, String apiKey, String model) {
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
	public List<Result> write(List<Input> batch) {
		if (!enabled()) {
			throw new IllegalStateException("GEMINI_API_KEY가 비어 있어요");
		}
		if (batch.isEmpty()) {
			return List.of();
		}
		return call(INSTRUCTION, batch.stream().map(in -> new Retry(in, null, null)).toList());
	}

	@Override
	public List<Result> rewrite(List<Retry> retries) {
		if (!enabled()) {
			throw new IllegalStateException("GEMINI_API_KEY가 비어 있어요");
		}
		if (retries.isEmpty()) {
			return List.of();
		}
		return call(REWRITE, retries);
	}

	/** 한 번 호출. draft·problem이 있으면 요청 항목에 함께 넣는다 */
	private List<Result> call(String instruction, List<Retry> items) {
		Map<Integer, Input> byId = new LinkedHashMap<>();
		List<Map<String, Object>> request = new ArrayList<>();
		for (Retry r : items) {
			int id = byId.size() + 1;
			byId.put(id, r.input());
			Map<String, Object> m = new LinkedHashMap<>();
			m.put("id", id);
			m.put("type", r.input().type());
			m.put("title", r.input().title());
			m.put("text", r.input().text());
			if (r.draft() != null) {
				m.put("draft", r.draft());
				m.put("problem", r.problem());
			}
			request.add(m);
		}
		String reply = gemini.generate(instruction, GeminiClient.toJson(request), GeminiClient.idTextSchema("summary"));
		List<Result> out = new ArrayList<>();
		for (Map<?, ?> row : GeminiClient.parseRows(reply)) {
			if (!(row.get("id") instanceof Number n) || !byId.containsKey(n.intValue())) {
				continue;
			}
			Input in = byId.remove(n.intValue());
			String text = row.get("summary") instanceof String s ? s : null;
			PlacementSummaries.Verdict v = PlacementSummaries.check(text, in.text(), in.names());
			out.add(v.ok() ? new Result(in.id(), v.summary(), null)
					: new Result(in.id(), null, v.reject().name(), PlacementSummaries.feedback(v), text == null ? "" : text.strip()));
		}
		return out;
	}
}
