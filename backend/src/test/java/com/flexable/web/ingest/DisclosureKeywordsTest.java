package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DisclosureKeywordsTest {

	@Test
	void 보고서_이름으로_근거_점수를_매긴다() {
		assertThat(DisclosureKeywords.weight("연결재무제표기준영업(잠정)실적(공정공시)")).isEqualTo(3);
		assertThat(DisclosureKeywords.weight("단일판매ㆍ공급계약체결")).isEqualTo(3);
		assertThat(DisclosureKeywords.weight("[기재정정]주요사항보고서(자기주식취득결정)")).isEqualTo(2);
		assertThat(DisclosureKeywords.weight("최대주주 변경")).isEqualTo(3);
		assertThat(DisclosureKeywords.weight("중대재해발생(종속회사의주요경영사항)               ")).isEqualTo(2);
		assertThat(DisclosureKeywords.weight("주식등의대량보유상황보고서(일반)")).isEqualTo(1);
		assertThat(DisclosureKeywords.weight("최대주주등소유주식변동신고서")).isEqualTo(1);
		// 같은 기간 공시로만(0점), 임원 지분 보고는 근거로 쓰지 않는다
		assertThat(DisclosureKeywords.weight("특수관계인에대한담보제공")).isZero();
		assertThat(DisclosureKeywords.weight("임원ㆍ주요주주특정증권등소유상황보고서")).isEqualTo(DisclosureKeywords.SKIP);
		assertThat(DisclosureKeywords.weight("[기재정정]임원ㆍ주요주주특정증권등소유상황보고서")).isEqualTo(DisclosureKeywords.SKIP);
		assertThat(DisclosureKeywords.weight(null)).isEqualTo(DisclosureKeywords.SKIP);
	}
}
