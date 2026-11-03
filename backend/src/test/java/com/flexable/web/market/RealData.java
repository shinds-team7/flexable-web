package com.flexable.web.market;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import com.flexable.web.market.EventDetector.Bar;

/**
 * 로컬 평가 DB에서 탐지기 입력을 읽는다(실데이터 검증 전용, CI에서는 쓰지 않는다). EventService.detect와 같은 종목을 같은 순서의 일봉으로 읽는다:
 * 시장 대용 종목 + 시장별 시가총액 순위가 있는 종목. 시세 원자료는 DB에만 두고 저장소에 넣지 않는다.
 *
 * 환경 변수: EVENT_BASELINE_DB_URL(JDBC 주소, 예: jdbc:h2:file:/절대경로/flexable-web;MODE=MySQL;DATABASE_TO_LOWER=TRUE;IFEXISTS=TRUE),
 * EVENT_BASELINE_DB_USER(기본 sa), EVENT_BASELINE_DB_PASSWORD(기본 빈 값), EVENT_BASELINE_PROXY(기본 069500).
 */
final class RealData {

	static final String DB_URL = "EVENT_BASELINE_DB_URL";

	/** 한 종목. etf는 EventService와 같이 kind = ETF. */
	record Instrument(String code, boolean etf, List<Bar> bars) {
	}

	record Loaded(Instrument proxy, List<Instrument> stocks) {
	}

	private RealData() {
	}

	static String proxyCode() {
		return env("EVENT_BASELINE_PROXY", "069500");
	}

	static Loaded load() throws SQLException {
		String proxy = proxyCode();
		try (Connection c = DriverManager.getConnection(System.getenv(DB_URL), env("EVENT_BASELINE_DB_USER", "sa"),
				env("EVENT_BASELINE_DB_PASSWORD", ""))) {
			List<String[]> rows = new ArrayList<>();
			try (PreparedStatement ps = c.prepareStatement(
					"SELECT id, code, kind FROM instruments WHERE cap_rank IS NOT NULL OR code = ? ORDER BY code")) {
				ps.setString(1, proxy);
				try (ResultSet rs = ps.executeQuery()) {
					while (rs.next()) {
						rows.add(new String[] { rs.getString(1), rs.getString(2), rs.getString(3) });
					}
				}
			}
			Instrument p = null;
			List<Instrument> stocks = new ArrayList<>();
			for (String[] r : rows) {
				Instrument inst = new Instrument(r[1], "ETF".equals(r[2]), bars(c, Long.parseLong(r[0])));
				if (r[1].equals(proxy)) {
					p = inst;
				}
				else {
					stocks.add(inst);
				}
			}
			if (p == null || p.bars().isEmpty()) {
				throw new IllegalStateException("시장 대용 종목 " + proxy + " 시세가 평가 DB에 없어요");
			}
			return new Loaded(p, stocks);
		}
	}

	private static List<Bar> bars(Connection c, long id) throws SQLException {
		List<Bar> out = new ArrayList<>();
		try (PreparedStatement ps = c.prepareStatement(
				"SELECT trade_date, close, volume FROM daily_prices WHERE instrument_id = ? ORDER BY trade_date")) {
			ps.setLong(1, id);
			try (ResultSet rs = ps.executeQuery()) {
				while (rs.next()) {
					long v = rs.getLong(3);
					out.add(new Bar(rs.getDate(1).toLocalDate(), rs.getLong(2), rs.wasNull() ? null : v));
				}
			}
		}
		return out;
	}

	private static String env(String name, String fallback) {
		String v = System.getenv(name);
		return v == null || v.isBlank() ? fallback : v;
	}
}
