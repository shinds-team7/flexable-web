package com.flexable.web.ingest;

import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.flexable.web.savings.SavingsCatalogService.PolicyData;

/**
 * 온통청년 청년정책(getPlcy) 중 적금·저축·통장 계열을 이름 검색으로 모은다(전체 3천여 건을 받지 않는다).
 * 요청 주소에 인증키가 들어가므로 원인 예외(메시지에 주소가 있음)는 밖으로 내보내지 않는다.
 * 서버가 가끔 500을 주므로 쪽마다 세 번까지 다시 시도한다.
 */
@Component
public class YouthCenterClient {

	/** 정책명에 이 말이 들어간 정책을 모은다. */
	static final List<String> KEYWORDS = List.of("적금", "저축", "통장", "계좌", "자산형성", "재형");
	private static final int PAGE_SIZE = 100;
	private static final int ATTEMPTS = 3;

	private final RestClient http;
	private final YouthCenterProperties props;

	public YouthCenterClient(YouthCenterProperties props) {
		this.props = props;
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(props.connectTimeout()).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(props.readTimeout());
		this.http = RestClient.builder().requestFactory(factory).defaultHeader("User-Agent", "Mozilla/5.0 (flexable-web)").build();
	}

	public boolean configured() {
		return props.configured();
	}

	/** 키워드별 검색 결과를 정책번호로 합친 목록. 한 번이라도 끝내 실패하면 예외(부분 결과로 기존 데이터를 덮어쓰지 않는다). */
	public List<PolicyData> fetchAll() {
		Map<String, PolicyData> byNo = new LinkedHashMap<>();
		for (String keyword : KEYWORDS) {
			int page = 1;
			int total = Integer.MAX_VALUE;
			while ((page - 1) * PAGE_SIZE < total) {
				Result r = page(keyword, page);
				total = r.pagging() == null ? 0 : r.pagging().totCount();
				for (Item i : r.youthPolicyList() == null ? List.<Item>of() : r.youthPolicyList()) {
					if (i.plcyNo() != null && !i.plcyNo().isBlank() && i.plcyNm() != null) {
						byNo.putIfAbsent(i.plcyNo().strip(), toData(i));
					}
				}
				page++;
			}
		}
		return new ArrayList<>(byNo.values());
	}

	private Result page(String keyword, int pageNo) {
		RuntimeException last = null;
		for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
			try {
				Envelope body = http.get()
					.uri(props.baseUrl() + "?apiKeyNm={key}&rtnType=json&pageSize={size}&pageNum={page}&plcyNm={nm}",
							props.apiKey(), PAGE_SIZE, pageNo, keyword)
					.retrieve()
					.body(Envelope.class);
				if (body != null && body.result() != null) {
					return body.result();
				}
			}
			catch (RuntimeException e) {
				last = e;
			}
			sleep(attempt * 1000L);
		}
		throw new IllegalStateException("youthcenter 호출 실패(" + keyword + ", " + pageNo + "쪽)"
				+ (last == null ? "" : ": " + last.getClass().getSimpleName()));
	}

	private static void sleep(long ms) {
		try {
			Thread.sleep(ms);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	private static PolicyData toData(Item i) {
		return new PolicyData(i.plcyNo().strip(), i.plcyNm().strip(), clean(i.plcyExplnCn()), clean(i.plcySprtCn()), clean(i.lclsfNm()),
				clean(i.mclsfNm()), clean(i.sprvsnInstCdNm()), clean(i.operInstCdNm()), clean(i.aplyYmd()), clean(i.bizPrdBgngYmd()),
				clean(i.bizPrdEndYmd()), clean(i.bizPrdEtcCn()), clean(i.plcyAplyMthdCn()), clean(i.srngMthdCn()), clean(i.sbmsnDcmntCn()),
				clean(i.aplyUrlAddr()), clean(i.refUrlAddr1()), clean(i.etcMttrCn()), age(i.sprtTrgtMinAge()), age(i.sprtTrgtMaxAge()),
				clean(i.earnEtcCn()), clean(i.addAplyQlfcCndCn()), clean(i.ptcpPrpTrgtCn()), clean(i.lastMdfcnDt()),
				PolicyRegion.resolve(i.zipCd(), i.sprvsnInstCdNm(), i.rgtrHghrkInstCdNm(), i.rgtrInstCdNm()));
	}

	private static String clean(String s) {
		return s == null || s.isBlank() ? null : s.strip();
	}

	private static Integer age(String s) {
		try {
			return s == null ? null : Integer.valueOf(s.strip());
		}
		catch (NumberFormatException e) {
			return null;
		}
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Envelope(Result result) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Result(Pagging pagging, List<Item> youthPolicyList) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Pagging(int totCount) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Item(String plcyNo, String plcyNm, String plcyExplnCn, String plcySprtCn, String lclsfNm, String mclsfNm,
			String sprvsnInstCdNm, String operInstCdNm, String aplyYmd, String bizPrdBgngYmd, String bizPrdEndYmd,
			String bizPrdEtcCn, String plcyAplyMthdCn, String srngMthdCn, String sbmsnDcmntCn, String aplyUrlAddr,
			String refUrlAddr1, String etcMttrCn, String sprtTrgtMinAge, String sprtTrgtMaxAge, String earnEtcCn,
			String addAplyQlfcCndCn, String ptcpPrpTrgtCn, String lastMdfcnDt, String zipCd, String rgtrInstCdNm,
			String rgtrHghrkInstCdNm) {
	}
}
