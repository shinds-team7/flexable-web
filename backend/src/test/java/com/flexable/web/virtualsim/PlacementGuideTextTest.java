package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * 배치고사 문제 카드의 유형 설명(src/data/placementGuide.ts, 프론트 정적 표)과 공시 주요 내용 항목(PlacementDetails)에 방향 암시·과거 경향·상승 비율 표현이 없는지 본다.
 * 그 값들은 결과 화면에서만 공개한다(decisions/2026-11-05-virtual-sim-contest 2-2). 유형 12개 모두 설명이 있어야 한다.
 */
class PlacementGuideTextTest {

	static final List<String> BANNED = List.of("오르", "오른", "올라", "내리", "내린", "내려", "상승", "하락", "호재", "악재", "경향", "대체로", "보통", "비율", "유리", "불리");

	private static Map<String, String> guide() throws Exception {
		String ts = Files.readString(Path.of("..", "src", "data", "placementGuide.ts"));
		Matcher m = Pattern.compile("^\\s+([A-Z_]+): '([^']+)',$", Pattern.MULTILINE).matcher(ts);
		Map<String, String> out = new HashMap<>();
		while (m.find()) {
			out.put(m.group(1), m.group(2));
		}
		return out;
	}

	@Test
	void 유형_12개_모두_중립_설명이_있다() throws Exception {
		Map<String, String> guide = guide();
		for (VirtualSimCategory c : VirtualSimCategory.values()) {
			assertThat(guide).as(c.name()).containsKey(c.name());
			String text = guide.get(c.name());
			assertThat(text.length()).as(c.name()).isBetween(20, 160);
			assertThat(BANNED).as(c.name() + ": " + text).noneMatch(text::contains);
		}
		assertThat(guide).hasSize(VirtualSimCategory.values().length);
	}

	/** 문제 화면 공시 줄글(src/data/disclosureStory.ts의 "문제 화면에도 쓰는 문구" 구간, Issue #308)에도 방향·경향·비율 표현이 없다. 회사·날짜·움직임은 결과에서만 붙인다 */
	@Test
	void 문제_화면_공시_줄글에도_방향_경향_비율_표현이_없다() throws Exception {
		String ts = Files.readString(Path.of("..", "src", "data", "disclosureStory.ts"));
		int from = ts.indexOf("// 문제 화면에도 쓰는 문구:start"), to = ts.indexOf("// 문제 화면에도 쓰는 문구:end");
		assertThat(from).isNotNegative();
		assertThat(to).isGreaterThan(from);
		Matcher m = Pattern.compile("'([^']*)'|`([^`]*)`").matcher(ts.substring(from, to));
		int texts = 0;
		while (m.find()) {
			String text = m.group(1) != null ? m.group(1) : m.group(2);
			texts++;
			assertThat(BANNED).as(text).noneMatch(text::contains);
		}
		assertThat(texts).isGreaterThan(20);
	}

	@Test
	void 주요_내용_항목에도_방향_경향_비율_표현이_없다() {
		for (VirtualSimCategory c : VirtualSimCategory.values()) {
			List<PlacementDetails.Detail> items = VirtualSimSample.details(c);
			if (items == null) {
				continue;
			}
			assertThat(items).hasSizeLessThanOrEqualTo(PlacementDetails.MAX_ITEMS);
			for (PlacementDetails.Detail d : items) {
				assertThat(BANNED).as(d.toString()).noneMatch(w -> d.label().contains(w) || d.value().contains(w));
			}
		}
	}

	/** 예시 자료의 공시 AI 요약도 실제 요약과 같은 검사를 통과하고(예시 회사 이름 없음), 방향·경향·비율 표현이 없다 */
	@Test
	void 예시_요약도_요약_검사를_통과한다() {
		List<String> companies = VirtualSimSample.companies().stream().map(VirtualSimSample.Draft::name).toList();
		int n = 0;
		for (VirtualSimCategory c : VirtualSimCategory.values()) {
			String summary = VirtualSimSample.summary(c);
			if (summary == null) {
				continue;
			}
			n++;
			// 공시 주요 내용이 있는 유형은 예시 요약을 두지 않는다(실제 출제 화면과 같은 갈래를 함께 보이려고)
			assertThat(VirtualSimSample.details(c)).as(c.name()).isNull();
			PlacementSummaries.Verdict v = PlacementSummaries.check(summary, summary, companies);
			assertThat(v.ok()).as(c.name() + ": " + v.reject()).isTrue();
			assertThat(BANNED).as(summary).noneMatch(summary.replace("보통주", "")::contains);
		}
		assertThat(n).isGreaterThanOrEqualTo(3);
	}
}
