package com.flexable.web.virtualsim;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
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

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 가상 시뮬레이션 저장소의 공개 창구(V26). 쓰기는 worker(ingest), 읽기는 api(세션)가 쓴다. 외부 API는 부르지 않는다.
 * 저장하는 것은 공시 목록·공시 주요 내용·룰셋(시장 통계)과 가상 회사·사건 글뿐이고 회원 정보는 없다.
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

	/** 공시 목록을 다 받은 종목 코드. 이어 받는 중(pending_from이 있음)인 종목은 최근 공시가 일부만 모였으므로 뺀다 */
	public List<String> archivedStocks() {
		return jdbc.queryForList("SELECT stock_code FROM dart_disclosure_archive WHERE covered_to IS NOT NULL AND pending_from IS NULL ORDER BY stock_code",
				String.class);
	}

	// ───────── 배치고사 공시 주요 내용(worker가 쓰고 api가 읽는다, V29) ─────────

	/** 공시 한 건의 화면용 항목. items가 비었으면 받아 봤지만 보일 항목이 없다(다시 받지 않는다) */
	public record DetailRow(String receiptNo, VirtualSimCategory category, List<PlacementDetails.Detail> items) {
	}

	/** 접수번호마다 지금 규칙 버전으로 덮어쓴다(다시 돌려도 같은 행). 넣거나 바꾼 수를 돌려준다 */
	@Transactional
	public int saveDetails(List<DetailRow> rows) {
		Timestamp now = Timestamp.from(clock.instant());
		int n = 0;
		for (DetailRow r : rows) {
			String items = json.writeValueAsString(r.items());
			int updated = jdbc.update("UPDATE dart_disclosure_details SET category = ?, items = ?, version = ?, collected_at = ? WHERE receipt_no = ?",
					r.category().name(), items, PlacementDetails.VERSION, now, r.receiptNo());
			if (updated == 0) {
				jdbc.update("INSERT INTO dart_disclosure_details (receipt_no, category, items, version, collected_at) VALUES (?, ?, ?, ?, ?)", r.receiptNo(),
						r.category().name(), items, PlacementDetails.VERSION, now);
			}
			n++;
		}
		return n;
	}

	/** 한 종목에서 지금 규칙 버전으로 이미 받은 공시의 접수번호 */
	public Set<String> detailedReceipts(String stockCode) {
		return new HashSet<>(jdbc.queryForList(
				"SELECT d.receipt_no FROM dart_disclosure_details d JOIN dart_disclosures x ON x.receipt_no = d.receipt_no WHERE x.stock_code = ? AND d.version = ?",
				String.class, stockCode, PlacementDetails.VERSION));
	}

	/** 한 종목의 공시별 화면용 항목(지금 규칙 버전, 항목이 있는 것만) */
	public Map<String, List<PlacementDetails.Detail>> details(String stockCode) {
		Map<String, List<PlacementDetails.Detail>> out = new LinkedHashMap<>();
		jdbc.query("SELECT d.receipt_no, d.items FROM dart_disclosure_details d JOIN dart_disclosures x ON x.receipt_no = d.receipt_no WHERE x.stock_code = ? AND d.version = ?",
				rs -> {
					List<PlacementDetails.Detail> items = json.readValue(rs.getString(2), new TypeReference<List<PlacementDetails.Detail>>() {
					});
					if (!items.isEmpty()) {
						out.put(rs.getString(1), List.copyOf(items));
					}
				}, stockCode, PlacementDetails.VERSION);
		return out;
	}

	/** 실패한 공시 주요 내용 묶음(종목·API) → 마지막 실패 시각. 다음 실행에서 맨 뒤로 미룬다(V30) */
	public Map<String, Instant> detailFailures() {
		Map<String, Instant> out = new HashMap<>();
		jdbc.query("SELECT stock_code, api, failed_at FROM dart_detail_failures", rs -> {
			out.put(rs.getString(1) + " " + rs.getString(2), rs.getTimestamp(3).toInstant());
		});
		return out;
	}

	@Transactional
	public void recordDetailFailure(String stockCode, String api, String error) {
		Timestamp now = Timestamp.from(clock.instant());
		int n = jdbc.update("UPDATE dart_detail_failures SET attempts = attempts + 1, error = ?, failed_at = ? WHERE stock_code = ? AND api = ?", cut(error, 300),
				now, stockCode, api);
		if (n == 0) {
			jdbc.update("INSERT INTO dart_detail_failures (stock_code, api, attempts, error, failed_at) VALUES (?, ?, 1, ?, ?)", stockCode, api, cut(error, 300), now);
		}
	}

	public void clearDetailFailure(String stockCode, String api) {
		jdbc.update("DELETE FROM dart_detail_failures WHERE stock_code = ? AND api = ?", stockCode, api);
	}

	// ───────── 배치고사 공시 AI 요약(worker가 쓰고 api가 읽는다, V33) ─────────

	/** 공시 한 건의 요약 결과. summary가 null이면 만들어 봤지만 쓸 요약이 없다(reason: 검사에 걸린 까닭 또는 NO_TEXT) */
	public record SummaryRow(String receiptNo, String summary, String reason, String model) {
	}

	/** 다시 만들지 않을 공시의 접수번호: 지금 작성 규칙 버전으로 만든 것과 운영자가 숨긴 것 */
	public Set<String> summarizedReceipts() {
		return new HashSet<>(jdbc.queryForList("SELECT receipt_no FROM dart_disclosure_summaries WHERE version = ? OR hidden = TRUE", String.class,
				PlacementSummaries.VERSION));
	}

	/** 접수번호마다 지금 작성 규칙 버전으로 덮어쓴다. 숨긴 행은 바꾸지 않는다. 넣거나 바꾼 수를 돌려준다 */
	@Transactional
	public int saveSummaries(List<SummaryRow> rows) {
		Timestamp now = Timestamp.from(clock.instant());
		int n = 0;
		for (SummaryRow r : rows) {
			int updated = jdbc.update("UPDATE dart_disclosure_summaries SET summary = ?, reason = ?, version = ?, model = ?, created_at = ? WHERE receipt_no = ? AND hidden = FALSE",
					r.summary(), r.reason(), PlacementSummaries.VERSION, r.model(), now, r.receiptNo());
			if (updated == 0 && jdbc.queryForObject("SELECT COUNT(*) FROM dart_disclosure_summaries WHERE receipt_no = ?", Integer.class, r.receiptNo()) == 0) {
				jdbc.update("INSERT INTO dart_disclosure_summaries (receipt_no, summary, reason, version, model, hidden, created_at) VALUES (?, ?, ?, ?, ?, FALSE, ?)",
						r.receiptNo(), r.summary(), r.reason(), PlacementSummaries.VERSION, r.model(), now);
				updated = 1;
			}
			n += updated;
		}
		return n;
	}

	/** 접수번호 → 문제에 실을 요약(요약이 있고 숨기지 않은 것만, 작성 규칙 버전은 따지지 않는다). 출제할 때 뽑은 공시만 묻는다 */
	public Map<String, String> summaries(java.util.Collection<String> receiptNos) {
		Map<String, String> out = new HashMap<>();
		if (receiptNos.isEmpty()) {
			return out;
		}
		String marks = String.join(",", java.util.Collections.nCopies(receiptNos.size(), "?"));
		jdbc.query("SELECT receipt_no, summary FROM dart_disclosure_summaries WHERE summary IS NOT NULL AND hidden = FALSE AND receipt_no IN (" + marks + ")",
				rs -> {
					out.put(rs.getString(1), rs.getString(2));
				}, receiptNos.toArray());
		return out;
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

	/** 저장한 룰셋과 그 행 번호. 대회 판은 행 번호를 두어 끊긴 판을 같은 룰셋으로 정산한다 */
	public record StoredRuleset(long id, VirtualSimRuleset ruleset) {
	}

	/** 지금 버전의 최신 룰셋과 행 번호 */
	public Optional<StoredRuleset> latestStoredRuleset(boolean sample) {
		return jdbc.query("SELECT id, payload FROM virtual_sim_rulesets WHERE version = ? AND is_sample = ? ORDER BY id DESC LIMIT 1",
				(rs, i) -> new StoredRuleset(rs.getLong(1), json.readValue(rs.getString(2), VirtualSimRuleset.class)), VirtualSimRuleset.VERSION, sample)
			.stream()
			.findFirst();
	}

	/** 행 번호로 룰셋(버전과 상관없이) */
	public Optional<VirtualSimRuleset> ruleset(long id) {
		return jdbc.query("SELECT payload FROM virtual_sim_rulesets WHERE id = ?", (rs, i) -> json.readValue(rs.getString(1), VirtualSimRuleset.class), id)
			.stream()
			.findFirst();
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

	/** 회사 한 곳(숨김·검사 버전과 상관없이, 숨긴 사건 포함). 진행 중인 대회 판을 시작할 때의 글로 정산할 때 쓴다 */
	public Optional<Company> company(long id) {
		List<Company> found = jdbc.query("SELECT id, name, industry, intro, model, generated_at, is_sample FROM virtual_sim_companies WHERE id = ?",
				(rs, i) -> new Company(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getTimestamp(6).toInstant(),
						rs.getBoolean(7), new EnumMap<>(VirtualSimCategory.class)),
				id);
		if (found.isEmpty()) {
			return Optional.empty();
		}
		Company c = found.getFirst();
		jdbc.query("SELECT category, body FROM virtual_sim_events WHERE company_id = ?", rs -> {
			try {
				c.bodies().put(VirtualSimCategory.valueOf(rs.getString(1)), rs.getString(2));
			}
			catch (IllegalArgumentException e) {
				// 지금 버전에 없는 유형은 쓰지 않는다
			}
		}, id);
		return Optional.of(c);
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
