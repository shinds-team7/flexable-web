package com.flexable.web.market;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "instruments")
public class Instrument {

	/** 시가총액 상위로 고른 종목(03 §5 featured_reason). */
	static final String MCAP_TOP = "MCAP_TOP";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 12, unique = true)
	private String code;

	@Column(nullable = false, length = 100)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private Board board;

	@Column(length = 20)
	private String market;

	@Column(nullable = false, length = 10)
	private String kind;

	@Column(name = "market_cap")
	private Long marketCap;

	@Column(name = "cap_rank")
	private Integer capRank;

	@Column(name = "featured_reason", length = 20)
	private String featuredReason;

	@Column(nullable = false, length = 60)
	private String source;

	@Column(name = "source_note", length = 200)
	private String sourceNote;

	@Column(name = "data_as_of", nullable = false)
	private LocalDate dataAsOf;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Instrument() {
	}

	Instrument(String code) {
		this.code = code;
	}

	void update(MarketDtos.InstrumentRow row, Board board, int rank, String source, String note, LocalDate asOf, Instant now) {
		this.name = row.name();
		this.board = board;
		this.market = row.market();
		this.kind = row.kind();
		this.marketCap = row.marketCap();
		this.capRank = rank;
		this.featuredReason = MCAP_TOP;
		this.source = source;
		this.sourceNote = note;
		this.dataAsOf = asOf;
		this.updatedAt = now;
	}

	/** 상위 목록에서 빠졌다. 받아 둔 시세는 남긴다. */
	void dropRank(Instant now) {
		this.capRank = null;
		this.featuredReason = null;
		this.updatedAt = now;
	}

	Long getId() {
		return id;
	}

	String getCode() {
		return code;
	}

	String getName() {
		return name;
	}

	Board getBoard() {
		return board;
	}

	String getMarket() {
		return market;
	}

	String getKind() {
		return kind;
	}

	Long getMarketCap() {
		return marketCap;
	}

	Integer getCapRank() {
		return capRank;
	}

	String getSource() {
		return source;
	}

	String getSourceNote() {
		return sourceNote;
	}

	LocalDate getDataAsOf() {
		return dataAsOf;
	}
}
