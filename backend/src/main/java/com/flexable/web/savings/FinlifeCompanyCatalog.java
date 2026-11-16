package com.flexable.web.savings;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * finlife 금융회사 공시의 홈페이지 주소(#449). 수집 작업이 전체 목록으로 교체하고, 적금·정기예금 상품 상세가 회사 번호로 읽는다.
 * 주소는 http·https만 남긴다. 상품 가입 페이지가 아니라 회사 홈페이지다(01 R2 가입 버튼 없음).
 */
@Service
public class FinlifeCompanyCatalog {

	/** 금융회사 한 곳. homepage는 공시 원문 그대로 넘기고 여기서 정리한다. */
	public record CompanyData(String finCoNo, String korCoNm, String homepage) {
	}

	/** "www.bank.co.kr"처럼 scheme 없이 온 주소. 공시 예시가 http라 http를 붙인다. */
	private static final Pattern BARE_HOST = Pattern.compile("^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(/\\S*)?$");

	private final FinlifeCompanyRepository companies;
	private final Clock clock;

	FinlifeCompanyCatalog(FinlifeCompanyRepository companies, Clock clock) {
		this.companies = companies;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public long count() {
		return companies.count();
	}

	/** 그 회사의 홈페이지(http·https), 없으면 null. */
	@Transactional(readOnly = true)
	public String homepage(String finCoNo) {
		return finCoNo == null ? null : companies.findById(finCoNo).map(FinlifeCompany::getHomepageUrl).orElse(null);
	}

	/** 전체 스냅숏 교체(같은 회사 번호는 갱신, 목록에 없는 회사는 삭제). 빈 목록은 받아들이지 않는다. 반영한 회사 수를 돌려준다. */
	@Transactional
	public int replaceAll(List<CompanyData> snapshot) {
		if (snapshot.isEmpty()) {
			throw new IllegalArgumentException("빈 금융회사 목록으로 교체할 수 없습니다");
		}
		Instant now = clock.instant();
		Set<String> keep = new HashSet<>();
		for (CompanyData d : snapshot) {
			if (d.finCoNo() == null || d.finCoNo().isBlank() || !keep.add(d.finCoNo())) {
				continue;
			}
			FinlifeCompany c = companies.findById(d.finCoNo()).orElseGet(() -> new FinlifeCompany(d.finCoNo()));
			c.apply(d.korCoNm() == null ? "" : d.korCoNm().strip(), normalize(d.homepage()), now);
			companies.save(c);
		}
		List<String> stale = companies.findAll().stream().map(FinlifeCompany::getFinCoNo).filter(no -> !keep.contains(no)).toList();
		if (!stale.isEmpty()) {
			companies.deleteAllById(stale);
		}
		return keep.size();
	}

	/** 공시 홈페이지 값을 링크로 쓸 수 있는 http·https 주소로. scheme이 없으면 http를 붙이고, 다른 scheme·형식이 깨진 값은 null. */
	static String normalize(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String s = raw.strip();
		if (!s.contains("://") && BARE_HOST.matcher(s).matches()) {
			s = "http://" + s;
		}
		if (s.length() > 300) {
			return null;
		}
		try {
			URI uri = new URI(s);
			String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
			if ((!scheme.equals("http") && !scheme.equals("https")) || uri.getHost() == null || uri.getUserInfo() != null) {
				return null;
			}
			return s;
		}
		catch (Exception e) {
			return null;
		}
	}
}
