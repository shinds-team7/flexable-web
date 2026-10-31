package com.flexable.web.ingest;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.flexable.web.deposit.DepositCatalogService;
import com.flexable.web.savings.SavingsCatalogService.OptionData;
import com.flexable.web.savings.SavingsCatalogService.ProductData;

/**
 * finlife 적금(savingProductsSearch.json)·정기예금(depositProductsSearch.json) 공시를 권역별로 모두 받아 상품+금리 옵션으로 묶는다.
 * 요청 주소에 인증키가 들어가므로 원인 예외(메시지에 주소가 있음)는 밖으로 내보내지 않는다.
 */
@Component
public class FinlifeClient {

	/** 권역 코드 → sector. 은행 020000, 저축은행 030300. */
	static final Map<String, String> GROUPS = Map.of("020000", "BANK", "030300", "SAVINGS_BANK");
	private static final String SAVING = "savingProductsSearch.json";
	private static final String DEPOSIT = "depositProductsSearch.json";

	private final RestClient http;
	private final FinlifeProperties props;

	public FinlifeClient(FinlifeProperties props) {
		this.props = props;
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(props.connectTimeout()).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(props.readTimeout());
		// finlife는 User-Agent가 없는 요청에서 연결을 끊는다
		this.http = RestClient.builder().requestFactory(factory).defaultHeader("User-Agent", "Mozilla/5.0 (flexable-web)").build();
	}

	public boolean configured() {
		return props.configured();
	}

	/** 모든 권역의 현재 공시 상품. 한 쪽이라도 실패하면 예외(부분 결과로 기존 데이터를 덮어쓰지 않는다). */
	public List<ProductData> fetchAll() {
		List<ProductData> all = new ArrayList<>();
		for (Map.Entry<String, String> g : GROUPS.entrySet()) {
			all.addAll(fetchGroup(g.getKey(), g.getValue()));
		}
		return all;
	}

	/** 모든 권역의 현재 정기예금 공시. 적금과 같이 한 쪽이라도 실패하면 예외. */
	public List<DepositCatalogService.ProductData> fetchAllDeposits() {
		List<DepositCatalogService.ProductData> all = new ArrayList<>();
		for (Map.Entry<String, String> g : GROUPS.entrySet()) {
			Collected c = collect(DEPOSIT, g.getKey());
			for (Map.Entry<String, BaseBody> e : c.bases().entrySet()) {
				BaseBody b = e.getValue();
				List<DepositCatalogService.OptionData> opts = c.options().getOrDefault(e.getKey(), List.of()).stream()
					.filter(o -> parseInt(o.saveTrm(), 0) > 0)
					.map(o -> new DepositCatalogService.OptionData(o.intrRateType(), parseInt(o.saveTrm(), 0), o.intrRate(), o.intrRate2()))
					.toList();
				all.add(new DepositCatalogService.ProductData(b.finCoNo(), b.finPrdtCd(), g.getValue(), b.dclsMonth(), b.korCoNm(),
						b.finPrdtNm(), b.joinWay(), b.mtrtInt(), b.spclCnd(), b.joinDeny(), b.joinMember(), b.etcNote(), b.maxLimit(),
						b.dclsStrtDay(), b.dclsEndDay(), b.finCoSubmDay(), opts));
			}
		}
		return all;
	}

	private List<ProductData> fetchGroup(String groupCode, String sector) {
		Collected c = collect(SAVING, groupCode);
		List<ProductData> out = new ArrayList<>();
		for (Map.Entry<String, BaseBody> e : c.bases().entrySet()) {
			BaseBody b = e.getValue();
			List<OptionData> opts = c.options().getOrDefault(e.getKey(), List.of()).stream()
				.map(o -> new OptionData(o.intrRateType(), o.rsrvType(), parseInt(o.saveTrm(), 0), o.intrRate(), o.intrRate2()))
				.filter(o -> o.saveTrm() > 0)
				.toList();
			out.add(new ProductData(b.finCoNo(), b.finPrdtCd(), sector, b.dclsMonth(), b.korCoNm(), b.finPrdtNm(), b.joinWay(),
					b.mtrtInt(), b.spclCnd(), b.joinDeny(), b.joinMember(), b.etcNote(), b.maxLimit(), b.dclsStrtDay(),
					b.dclsEndDay(), b.finCoSubmDay(), opts));
		}
		return out;
	}

	/** 한 권역의 모든 쪽을 받아 상품(base)과 금리 줄(option)을 (회사번호|상품코드)로 묶는다. */
	private Collected collect(String endpoint, String groupCode) {
		Map<String, BaseBody> bases = new LinkedHashMap<>();
		Map<String, List<OptionBody>> options = new LinkedHashMap<>();
		int page = 1;
		int maxPage = 1;
		while (page <= maxPage) {
			Result r = page(endpoint, groupCode, page);
			maxPage = parseInt(r.maxPageNo(), 1);
			for (BaseBody b : r.baseList() == null ? List.<BaseBody>of() : r.baseList()) {
				bases.put(key(b.finCoNo(), b.finPrdtCd()), b);
			}
			for (OptionBody o : r.optionList() == null ? List.<OptionBody>of() : r.optionList()) {
				options.computeIfAbsent(key(o.finCoNo(), o.finPrdtCd()), k -> new ArrayList<>()).add(o);
			}
			page++;
		}
		return new Collected(bases, options);
	}

	private record Collected(Map<String, BaseBody> bases, Map<String, List<OptionBody>> options) {
	}

	private Result page(String endpoint, String groupCode, int pageNo) {
		Envelope body;
		try {
			body = http.get()
				.uri(props.baseUrl() + "/{endpoint}?auth={auth}&topFinGrpNo={group}&pageNo={page}",
						endpoint, props.apiKey(), groupCode, pageNo)
				.retrieve()
				.body(Envelope.class);
		}
		catch (RuntimeException e) {
			throw new IllegalStateException("finlife 호출 실패(" + endpoint + ", 권역 " + groupCode + ", " + pageNo + "쪽): " + e.getClass().getSimpleName());
		}
		if (body == null || body.result() == null) {
			throw new IllegalStateException("finlife 응답이 비어 있음(권역 " + groupCode + ")");
		}
		if (!"000".equals(body.result().errCd())) {
			throw new IllegalStateException("finlife 오류 " + body.result().errCd() + " " + body.result().errMsg());
		}
		return body.result();
	}

	private static String key(String finCoNo, String finPrdtCd) {
		return finCoNo + "|" + finPrdtCd;
	}

	private static int parseInt(String s, int fallback) {
		try {
			return Integer.parseInt(s.trim());
		}
		catch (RuntimeException e) {
			return fallback;
		}
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Envelope(Result result) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Result(@JsonProperty("err_cd") String errCd, @JsonProperty("err_msg") String errMsg,
			@JsonProperty("max_page_no") String maxPageNo, List<BaseBody> baseList, List<OptionBody> optionList) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record BaseBody(@JsonProperty("dcls_month") String dclsMonth, @JsonProperty("fin_co_no") String finCoNo,
			@JsonProperty("fin_prdt_cd") String finPrdtCd, @JsonProperty("kor_co_nm") String korCoNm,
			@JsonProperty("fin_prdt_nm") String finPrdtNm, @JsonProperty("join_way") String joinWay,
			@JsonProperty("mtrt_int") String mtrtInt, @JsonProperty("spcl_cnd") String spclCnd,
			@JsonProperty("join_deny") String joinDeny, @JsonProperty("join_member") String joinMember,
			@JsonProperty("etc_note") String etcNote, @JsonProperty("max_limit") Long maxLimit,
			@JsonProperty("dcls_strt_day") String dclsStrtDay, @JsonProperty("dcls_end_day") String dclsEndDay,
			@JsonProperty("fin_co_subm_day") String finCoSubmDay) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record OptionBody(@JsonProperty("fin_co_no") String finCoNo, @JsonProperty("fin_prdt_cd") String finPrdtCd,
			@JsonProperty("intr_rate_type") String intrRateType, @JsonProperty("rsrv_type") String rsrvType,
			@JsonProperty("save_trm") String saveTrm, @JsonProperty("intr_rate") BigDecimal intrRate,
			@JsonProperty("intr_rate2") BigDecimal intrRate2) {
	}
}
