package com.flexable.web.ingest.fake;

import java.util.ArrayList;
import java.util.List;

import com.flexable.web.ingest.EventOverviewWriter;
import com.flexable.web.ingest.gemini.GeminiEventOverviewWriter;
import com.flexable.web.market.EventDtos.OverviewInput;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;

/**
 * 키 없이 쓰는 예시 개요(EVENT_OVERVIEW_SOURCE=fake). 입력 값으로 정해진 틀의 문장을 만들고 isSample로 저장한다.
 * 화면은 "AI 요약" 대신 "예시"로 보인다. Gemini와 같은 검사를 거친다(길면 뒤 문장부터 뺀다).
 */
public class FakeEventOverviewWriter implements EventOverviewWriter {

	public static final String MODEL = "sample";

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public List<OverviewResult> write(List<OverviewTarget> batch) {
		return batch.stream()
			.map(t -> new OverviewResult(t.input().id(), t.inputHash(), text(t.input()), MODEL, true))
			.toList();
	}

	static String text(OverviewInput in) {
		boolean market = "MARKET".equals(in.scope());
		String moved = "RISE".equals(in.direction()) ? "올랐어요" : "내렸어요";
		List<String> parts = new ArrayList<>();
		parts.add((market ? "시장 전체는 " : in.name() + " 주가는 ") + in.period() + "에 " + in.returnRate() + " " + moved + ".");
		if (in.volumeRatio() != null) {
			parts.add("거래량은 평소의 " + in.volumeRatio() + "였어요.");
		}
		if (market) {
			parts.add("특정 회사 공시와 연결하지 않은 시장 전체 움직임이에요.");
		}
		else if (!in.disclosures().isEmpty()) {
			parts.add("이 기간에 " + in.disclosures().getFirst() + " 공시가 있었어요.");
		}
		while (!parts.isEmpty()) {
			String checked = GeminiEventOverviewWriter.check(String.join(" ", parts), in);
			if (checked != null) {
				return checked;
			}
			parts.removeLast();
		}
		return null;
	}
}
