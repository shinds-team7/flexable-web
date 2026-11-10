package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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

	/**
	 * 문제 화면 공시 줄글(src/data/disclosureStory.ts의 "문제 화면에도 쓰는 문구" 구간, Issue #308)에도 방향·경향·비율 표현이 없다. 회사·날짜·움직임은 결과에서만 붙인다.
	 * 항목 읽는 법 문장(#387)을 더하면서 「공시 읽는 법」과 같은 GUIDE_BANNED(주가·평가·전망·권유)로 본다. "주주가"는 빼고 본다
	 */
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
			String checked = text.replace("주주가", "");
			assertThat(GUIDE_BANNED).as(text).noneMatch(checked::contains);
		}
		assertThat(texts).isGreaterThan(50);
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

	/**
	 * 「공시 읽는 법」(/simulation/guide, Issue #367)은 항목과 뜻만 적는다. 위 금지 표현에 공시 AI 요약 검사(policies §8-8 "공시 AI 요약" BANNED)의 주가·평가·전망·권유 낱말을 더해 본다.
	 * 줄 주석(//)과, 요약 검사처럼 "주주가"(최대주주가·회사 주주가)는 빼고 본다
	 */
	static final List<String> GUIDE_BANNED = Stream.concat(BANNED.stream(), Stream.of("주가", "오름", "내림", "급등", "급락", "긍정", "부정적",
			"좋은 소식", "나쁜 소식", "기대", "우려", "전망", "예상", "예측", "앞으로", "향후", "가능성", "반드시", "확실", "무조건", "추천", "권유", "사세요", "파세요",
			"목표가", "저평가", "고평가")).toList();

	@Test
	void 공시_읽는_법_글에도_방향_평가_경향_표현이_없다() throws Exception {
		for (Path file : List.of(Path.of("..", "src", "pages", "SimulationGuide.tsx"), Path.of("..", "src", "data", "simulationGuide.ts"))) {
			String text = Files.readString(file).replaceAll("(?m)^\\s*//.*$", "").replace("주주가", "");
			assertThat(text).as(file.toString()).contains("확인할 것").hasSizeGreaterThan(1000);
			assertThat(GUIDE_BANNED).as(file.toString()).noneMatch(text::contains);
		}
		// 유형 12개 모두 확인할 것이 있다
		String data = Files.readString(Path.of("..", "src", "data", "simulationGuide.ts"));
		for (VirtualSimCategory c : VirtualSimCategory.values()) {
			assertThat(data).as(c.name()).contains("category: '" + c.name() + "'").contains("name: '" + c.displayName() + "'");
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
			// 예시 요약은 예시 사건 글에 있는 사실만 담는다: 사건 글에 없는 숫자(%·금액)가 요약에 없다
			assertThat(summary).as(c.name()).doesNotContainPattern("\\d");
			assertThat(VirtualSimSample.companies()).as(c.name()).allSatisfy(d -> assertThat(d.bodies()).containsKey(c));
			PlacementSummaries.Verdict v = PlacementSummaries.check(summary, summary, companies);
			assertThat(v.ok()).as(c.name() + ": " + v.reject()).isTrue();
			assertThat(BANNED).as(summary).noneMatch(summary.replace("보통주", "")::contains);
		}
		assertThat(n).isGreaterThanOrEqualTo(3);
	}
}
