package com.flexable.web.virtualsim;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

/**
 * 가상 시뮬레이션 저장소의 공개 창구(V26). 쓰기는 worker(ingest), 읽기는 api(세션)가 쓴다. 외부 API는 부르지 않는다.
 * 저장하는 것은 공시 목록·룰셋(시장 통계)과 가상 회사·사건 글뿐이고 회원 정보는 없다.
 */
@Service
public class VirtualSimStore {

	private final JdbcTemplate jdbc;
	private final Clock clock;
	private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();

	public VirtualSimStore(JdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	// ───────── 전체 공시 목록(worker) ─────────

	/** 공시 한 건. receiptNo는 DART 접수번호 */
	public record DisclosureRow(String receiptNo, String stockCode, String corpCode, String title, LocalDate date) {
	}

	/** 종목 하나의 수집 진행. coveredTo가 있으면 coveredFrom~coveredTo를 다 받았다. pending*·nextPage는 멈춘 구간과 다음 쪽 */
	public record Archive(String stockCode, String corpCode, LocalDate coveredFrom, LocalDate coveredTo, LocalDate pendingFrom, LocalDate pendingTo,
			Integer nextPage) {

		public boolean complete() {
			return coveredTo != null;
		}
	}

	/** 접수번호가 이미 있으면 건너뛴다. 새로 넣은 수를 돌려준다 */
	@Transactional
	public int saveDisclosures(List<DisclosureRow> rows) {
		if (rows.isEmpty()) {
			return 0;
		}
		Set<String> existing = new HashSet<>();
		List<String> numbers = rows.stream().map(DisclosureRow::receiptNo).distinct().toList();
		for (int i = 0; i < numbers.size(); i += 500) {
			List<String> part = numbers.subList(i, Math.min(numbers.size(), i + 500));
			existing.addAll(jdbc.queryForList("SELECT receipt_no FROM dart_disclosures WHERE receipt_no IN (" + "?,".repeat(part.size() - 1) + "?)",
					String.class, part.toArray()));
		}
		Timestamp now = Timestamp.from(clock.instant());
		List<Object[]> insert = new ArrayList<>();
		for (DisclosureRow r : rows) {
			if (existing.add(r.receiptNo())) {
				insert.add(new Object[] { r.receiptNo(), r.stockCode(), r.corpCode(), cut(r.title(), 300), Date.valueOf(r.date()), now });
			}
		}
		jdbc.batchUpdate("INSERT INTO dart_disclosures (receipt_no, stock_code, corp_code, title, receipt_date, collected_at) VALUES (?, ?, ?, ?, ?, ?)",
				insert);
		return insert.size();
	}

	public List<DisclosureRow> disclosures(String stockCode) {
		return jdbc.query("SELECT receipt_no, stock_code, corp_code, title, receipt_date FROM dart_disclosures WHERE stock_code = ? ORDER BY receipt_date, receipt_no",
				(rs, i) -> new DisclosureRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getDate(5).toLocalDate()), stockCode);
	}

	public Optional<Archive> archive(String stockCode) {
		return jdbc.query("SELECT stock_code, corp_code, covered_from, covered_to, pending_from, pending_to, next_page FROM dart_disclosure_archive WHERE stock_code = ?",
				(rs, i) -> new Archive(rs.getString(1), rs.getString(2), date(rs.getDate(3)), date(rs.getDate(4)), date(rs.getDate(5)), date(rs.getDate(6)),
						rs.getObject(7) == null ? null : rs.getInt(7)),
				stockCode).stream().findFirst();
	}

	@Transactional
	public void saveArchive(Archive a) {
		Timestamp now = Timestamp.from(clock.instant());
		int n = jdbc.update("UPDATE dart_disclosure_archive SET corp_code = ?, covered_from = ?, covered_to = ?, pending_from = ?, pending_to = ?, next_page = ?, updated_at = ? WHERE stock_code = ?",
				a.corpCode(), sql(a.coveredFrom()), sql(a.coveredTo()), sql(a.pendingFrom()), sql(a.pendingTo()), a.nextPage(), now, a.stockCode());
		if (n == 0) {
			jdbc.update("INSERT INTO dart_disclosure_archive (stock_code, corp_code, covered_from, covered_to, pending_from, pending_to, next_page, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
					a.stockCode(), a.corpCode(), sql(a.coveredFrom()), sql(a.coveredTo()), sql(a.pendingFrom()), sql(a.pendingTo()), a.nextPage(), now);
		}
	}

	/** 공시 목록을 다 받은 종목 코드 */
	public List<String> archivedStocks() {
		return jdbc.queryForList("SELECT stock_code FROM dart_disclosure_archive WHERE covered_to IS NOT NULL ORDER BY stock_code", String.class);
	}

	// ───────── 룰셋 ─────────

	@Transactional
	public void saveRuleset(VirtualSimRuleset r) {
		jdbc.update("INSERT INTO virtual_sim_rulesets (version, data_from, data_to, payload, is_sample, created_at) VALUES (?, ?, ?, ?, ?, ?)", r.version(),
				r.dataFrom() == null ? null : Date.valueOf(r.dataFrom()), r.dataTo() == null ? null : Date.valueOf(r.dataTo()), json.writeValueAsString(r),
				r.isSample(), Timestamp.from(clock.instant()));
	}

	/** 지금 버전의 최신 룰셋 */
	public Optional<VirtualSimRuleset> latestRuleset(boolean sample) {
		return jdbc.query("SELECT payload FROM virtual_sim_rulesets WHERE version = ? AND is_sample = ? ORDER BY id DESC LIMIT 1",
				(rs, i) -> json.readValue(rs.getString(1), VirtualSimRuleset.class), VirtualSimRuleset.VERSION, sample).stream().findFirst();
	}

	// ───────── 가상 회사·사건 ─────────

	/** 공개 가능한 회사 한 곳(숨기지 않은 사건만). generatedAt은 글을 만든 시각 */
	public record Company(long id, String name, String industry, String intro, String model, Instant generatedAt, boolean sample,
			Map<VirtualSimCategory, String> bodies) {
	}

	/** 자동 검사를 통과한 회사와 사건 본문을 넣는다. 사건이 없으면 넣지 않는다 */
	@Transactional
	public void saveCompany(VirtualSimSample.Draft d, String model, String promptVersion, String checkVersion, boolean sample, Instant generatedAt) {
		if (d.bodies().isEmpty()) {
			return;
		}
		KeyHolder key = new GeneratedKeyHolder();
		jdbc.update(con -> {
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO virtual_sim_companies (name, industry, intro, model, prompt_version, check_version, is_sample, hidden, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?)",
					new String[] { "id" });
			ps.setString(1, d.name());
			ps.setString(2, d.industry());
			ps.setString(3, d.intro());
			ps.setString(4, cut(model, 80));
			ps.setString(5, promptVersion);
			ps.setString(6, checkVersion);
			ps.setBoolean(7, sample);
			ps.setTimestamp(8, Timestamp.from(generatedAt));
			return ps;
		}, key);
		long id = key.getKey().longValue();
		jdbc.batchUpdate("INSERT INTO virtual_sim_events (company_id, category, body, hidden) VALUES (?, ?, ?, FALSE)",
				d.bodies().entrySet().stream().map(e -> new Object[] { id, e.getKey().name(), e.getValue() }).toList());
	}

	/** 숨기지 않았고 지금 검사 버전으로 통과한 회사. 사건은 숨기지 않은 것만 */
	public List<Company> companies(boolean sample, String checkVersion) {
		Map<Long, Company> out = new LinkedHashMap<>();
		jdbc.query("SELECT id, name, industry, intro, model, generated_at, is_sample FROM virtual_sim_companies WHERE is_sample = ? AND hidden = FALSE AND check_version = ? ORDER BY id",
				rs -> {
					out.put(rs.getLong(1), new Company(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
							rs.getTimestamp(6).toInstant(), rs.getBoolean(7), new EnumMap<>(VirtualSimCategory.class)));
				}, sample, checkVersion);
		jdbc.query("SELECT e.company_id, e.category, e.body FROM virtual_sim_events e JOIN virtual_sim_companies c ON c.id = e.company_id WHERE c.is_sample = ? AND c.hidden = FALSE AND e.hidden = FALSE",
				rs -> {
					Company c = out.get(rs.getLong(1));
					if (c != null) {
						try {
							c.bodies().put(VirtualSimCategory.valueOf(rs.getString(2)), rs.getString(3));
						}
						catch (IllegalArgumentException e) {
							// 지금 버전에 없는 유형은 쓰지 않는다
						}
					}
				}, sample);
		return List.copyOf(out.values());
	}

	/** 지금 검사 버전으로 통과한 회사 이름(숨긴 것 포함). 같은 이름은 다시 쓰지 않는다. 이전 버전 회사는 후보가 아니라 이름을 다시 쓸 수 있다 */
	public Set<String> companyNames(String checkVersion) {
		return new HashSet<>(jdbc.queryForList("SELECT name FROM virtual_sim_companies WHERE check_version = ?", String.class, checkVersion));
	}

	/** 업종별 회사 수(숨긴 것 포함). 새 회사의 업종을 고르게 나눌 때 쓴다 */
	public Map<String, Integer> industryCounts(boolean sample) {
		Map<String, Integer> out = new LinkedHashMap<>();
		jdbc.query("SELECT industry, COUNT(*) FROM virtual_sim_companies WHERE is_sample = ? GROUP BY industry",
				rs -> {
					out.put(rs.getString(1), rs.getInt(2));
				}, sample);
		return out;
	}

	/** 지금 검사 버전으로 통과한 회사 수 */
	public int countCompanies(boolean sample, String checkVersion) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_sim_companies WHERE is_sample = ? AND check_version = ?", Integer.class, sample,
				checkVersion);
		return n == null ? 0 : n;
	}

	private static String cut(String s, int max) {
		return s == null || s.length() <= max ? s : s.substring(0, max);
	}

	private static LocalDate date(Date d) {
		return d == null ? null : d.toLocalDate();
	}

	private static Date sql(LocalDate d) {
		return d == null ? null : Date.valueOf(d);
	}
}
