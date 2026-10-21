package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PolicyRegionTest {

	private static final String ALL = "11110,11140,26110,27110,28110,29110,30110,31110,36110,41111,43111,44131,46110,47111,48121,50110,51110";

	@Test
	void ministriesAreNationwide() {
		assertThat(PolicyRegion.resolve(ALL, "금융위원회", "금융위원회", "금융위원회")).isEqualTo("전국");
		assertThat(PolicyRegion.resolve(ALL, "국방부", "국방부", "국방부")).isEqualTo("전국");
		assertThat(PolicyRegion.resolve(ALL, "보건복지부", "B000000 정부산하기관및위원회", "한국고용정보원")).isEqualTo("전국");
	}

	@Test
	void regionFromInstitutionName() {
		assertThat(PolicyRegion.resolve(ALL, "인천광역시 보건복지국", null, null)).isEqualTo("인천");
		// 주관기관은 중앙부처인데 등록 기관이 지자체인 경우
		assertThat(PolicyRegion.resolve("11110", "보건복지부", "전북특별자치도", "전북특별자치도")).isEqualTo("전북");
		assertThat(PolicyRegion.resolve(null, "청년정책과", "충청북도", "충청북도 기획조정실")).isEqualTo("충북");
		assertThat(PolicyRegion.resolve(null, "전남광주통합특별시 영광군", "전남광주통합특별시", null)).isEqualTo("광주·전남");
		assertThat(PolicyRegion.resolve(null, "경상남도 함안군 혁신전략담당관", null, null)).isEqualTo("경남");
	}

	@Test
	void regionFromZipWhenNamesSayNothing() {
		assertThat(PolicyRegion.resolve("36110", "기업지원과", "정부산하기관", null)).isEqualTo("세종");
		assertThat(PolicyRegion.resolve("50110,50130", "노동일자리과", "", "")).isEqualTo("제주");
		assertThat(PolicyRegion.resolve("", "기업지원과")).isEqualTo("전국");
	}
}
