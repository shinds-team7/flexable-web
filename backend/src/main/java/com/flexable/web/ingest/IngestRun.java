package com.flexable.web.ingest;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 수집 실행 한 번의 기록. status: RUNNING | SUCCESS | PARTIAL | FAILED */
@Entity
@Table(name = "ingest_runs")
public class IngestRun {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 40)
	private String job;

	@Column(name = "target_date", nullable = false)
	private LocalDate targetDate;

	@Column(nullable = false, length = 12)
	private String status;

	@Column(name = "started_at", nullable = false)
	private Instant startedAt;

	@Column(name = "finished_at")
	private Instant finishedAt;

	@Column(name = "row_count", nullable = false)
	private int rowCount;

	@Column(length = 500)
	private String error;

	protected IngestRun() {
	}

	IngestRun(String job, LocalDate targetDate, Instant now) {
		this.job = job;
		this.targetDate = targetDate;
		this.status = "RUNNING";
		this.startedAt = now;
	}

	void finish(String status, int rowCount, String error, Instant now) {
		this.status = status;
		this.rowCount = rowCount;
		this.error = error == null ? null : error.substring(0, Math.min(500, error.length()));
		this.finishedAt = now;
	}

	String getStatus() {
		return status;
	}

	int getRowCount() {
		return rowCount;
	}
}
