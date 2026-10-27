package com.flexable.web.market;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** 시장 띠 칸 하나의 하루 값. source는 화면에 보이는 제공처 이름. */
@Entity
@Table(name = "market_index_daily")
@IdClass(MarketIndexDaily.Key.class)
public class MarketIndexDaily {

	public record Key(IndexKey indexKey, LocalDate tradeDate) implements Serializable {
		public Key() {
			this(null, null);
		}
	}

	@Id
	@Enumerated(EnumType.STRING)
	@Column(name = "index_key", length = 16)
	private IndexKey indexKey;

	@Id
	@Column(name = "trade_date")
	private LocalDate tradeDate;

	@Column(name = "index_value", nullable = false, precision = 18, scale = 2)
	private BigDecimal value;

	@Column(nullable = false, length = 60)
	private String source;

	@Column(name = "collected_at", nullable = false)
	private Instant collectedAt;

	protected MarketIndexDaily() {
	}

	MarketIndexDaily(IndexKey indexKey, LocalDate tradeDate) {
		this.indexKey = indexKey;
		this.tradeDate = tradeDate;
	}

	void set(BigDecimal value, String source, Instant now) {
		this.value = value;
		this.source = source;
		this.collectedAt = now;
	}

	IndexKey getIndexKey() {
		return indexKey;
	}

	LocalDate getTradeDate() {
		return tradeDate;
	}

	BigDecimal getValue() {
		return value;
	}

	String getSource() {
		return source;
	}
}
