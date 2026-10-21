package com.flexable.web.market;

import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** 종목·거래일 한 줄. close는 제공처가 준 수정주가 종가(원). */
@Entity
@Table(name = "daily_prices")
@IdClass(DailyPrice.Key.class)
public class DailyPrice {

	public record Key(Long instrumentId, LocalDate tradeDate) implements Serializable {
		public Key() {
			this(null, null);
		}
	}

	@Id
	@Column(name = "instrument_id")
	private Long instrumentId;

	@Id
	@Column(name = "trade_date")
	private LocalDate tradeDate;

	@Column(nullable = false)
	private long close;

	private Long volume;

	@Column(nullable = false, length = 60)
	private String source;

	@Column(name = "collected_at", nullable = false)
	private Instant collectedAt;

	protected DailyPrice() {
	}

	DailyPrice(long instrumentId, LocalDate tradeDate) {
		this.instrumentId = instrumentId;
		this.tradeDate = tradeDate;
	}

	void set(long close, Long volume, String source, Instant now) {
		this.close = close;
		this.volume = volume;
		this.source = source;
		this.collectedAt = now;
	}

	LocalDate getTradeDate() {
		return tradeDate;
	}

	long getClose() {
		return close;
	}

	String getSource() {
		return source;
	}
}
