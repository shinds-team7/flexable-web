package com.flexable.web.market;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 급변동 사건 하나(03 C-8). scope: STOCK | MARKET(시장 대용 종목에 붙인다), direction: RISE | FALL. */
@Entity
@Table(name = "market_events")
public class MarketEvent {

	static final String STOCK = "STOCK";
	static final String MARKET = "MARKET";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "instrument_id", nullable = false)
	private Long instrumentId;

	@Column(nullable = false, length = 10)
	private String scope;

	@Column(name = "start_date", nullable = false)
	private LocalDate startDate;

	@Column(name = "end_date", nullable = false)
	private LocalDate endDate;

	@Column(name = "window_days", nullable = false)
	private int windowDays;

	@Column(nullable = false, length = 4)
	private String direction;

	@Column(name = "return_rate", nullable = false)
	private double returnRate;

	@Column(name = "market_return")
	private Double marketReturn;

	@Column(name = "z_score", nullable = false)
	private double zScore;

	@Column(name = "volume_ratio")
	private Double volumeRatio;

	@Column(nullable = false)
	private double score;

	@Column(name = "rank_in_year", nullable = false)
	private int rankInYear;

	@Column(name = "detector_version", nullable = false, length = 20)
	private String detectorVersion;

	@Column(name = "detected_at", nullable = false)
	private Instant detectedAt;

	@Column(name = "evidence_checked_at")
	private Instant evidenceCheckedAt;

	/** AI 개요(decisions/2026-10-29-event-ai-summary). 검사를 통과하지 못했으면 null이고 hash만 남는다. */
	@Column(name = "ai_summary", length = 400)
	private String aiSummary;

	@Column(name = "ai_summary_model", length = 60)
	private String aiSummaryModel;

	@Column(name = "ai_summary_hash", length = 64)
	private String aiSummaryHash;

	@Column(name = "ai_summary_at")
	private Instant aiSummaryAt;

	@Column(name = "ai_summary_sample", nullable = false)
	private boolean aiSummarySample;

	/** 운영자가 공개를 멈춘 개요(DB에서 직접 바꾼다). */
	@Column(name = "ai_summary_hidden", nullable = false)
	private boolean aiSummaryHidden;

	protected MarketEvent() {
	}

	MarketEvent(long instrumentId, String scope, String detectorVersion) {
		this.instrumentId = instrumentId;
		this.scope = scope;
		this.detectorVersion = detectorVersion;
	}

	/** 탐지 결과로 값을 바꾼다. 기간이 바뀌면 근거를 다시 찾도록 확인 시각을 지운다. */
	void apply(EventDetector.Detected d, Instant now) {
		if (!d.start().equals(startDate) || !d.end().equals(endDate)) {
			this.evidenceCheckedAt = null;
		}
		this.startDate = d.start();
		this.endDate = d.end();
		this.windowDays = d.windowDays();
		this.direction = d.direction();
		this.returnRate = d.returnRate();
		this.marketReturn = d.marketReturn();
		this.zScore = d.zScore();
		this.volumeRatio = d.volumeRatio();
		this.score = d.score();
		this.rankInYear = d.rankInYear();
		this.detectedAt = now;
	}

	void evidenceChecked(Instant now) {
		this.evidenceCheckedAt = now;
	}

	/** 개요를 넣는다. summary가 null이면(검사 탈락) 문장 없이 입력 지문만 남겨 같은 입력으로 다시 부르지 않는다. */
	void overview(String summary, String model, String inputHash, boolean sample, Instant now) {
		this.aiSummary = summary;
		this.aiSummaryModel = model;
		this.aiSummaryHash = inputHash;
		this.aiSummarySample = sample;
		this.aiSummaryAt = now;
	}

	boolean overlaps(LocalDate start, LocalDate end) {
		return !startDate.isAfter(end) && !endDate.isBefore(start);
	}

	Long getId() {
		return id;
	}

	Long getInstrumentId() {
		return instrumentId;
	}

	String getScope() {
		return scope;
	}

	LocalDate getStartDate() {
		return startDate;
	}

	LocalDate getEndDate() {
		return endDate;
	}

	int getWindowDays() {
		return windowDays;
	}

	String getDirection() {
		return direction;
	}

	double getReturnRate() {
		return returnRate;
	}

	Double getMarketReturn() {
		return marketReturn;
	}

	double getScore() {
		return score;
	}

	String getDetectorVersion() {
		return detectorVersion;
	}

	Double getVolumeRatio() {
		return volumeRatio;
	}

	Instant getEvidenceCheckedAt() {
		return evidenceCheckedAt;
	}

	int getRankInYear() {
		return rankInYear;
	}

	String getAiSummary() {
		return aiSummary;
	}

	String getAiSummaryModel() {
		return aiSummaryModel;
	}

	String getAiSummaryHash() {
		return aiSummaryHash;
	}

	Instant getAiSummaryAt() {
		return aiSummaryAt;
	}

	boolean isAiSummarySample() {
		return aiSummarySample;
	}

	boolean isAiSummaryHidden() {
		return aiSummaryHidden;
	}
}
