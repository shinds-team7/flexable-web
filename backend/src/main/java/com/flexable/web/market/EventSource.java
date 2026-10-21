package com.flexable.web.market;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 사건 근거 하나(03 §5-4). type: DART(공시). externalId는 제공처 번호(DART 접수번호). */
@Entity
@Table(name = "event_sources")
public class EventSource {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "event_id", nullable = false)
	private Long eventId;

	@Column(nullable = false, length = 10)
	private String type;

	@Column(name = "external_id", nullable = false, length = 40)
	private String externalId;

	@Column(nullable = false, length = 300)
	private String title;

	@Column(length = 100)
	private String publisher;

	@Column(name = "published_date", nullable = false)
	private LocalDate publishedDate;

	@Column(nullable = false, length = 300)
	private String url;

	@Column(nullable = false)
	private int weight;

	protected EventSource() {
	}

	EventSource(long eventId, EventDtos.EvidenceRow row) {
		this.eventId = eventId;
		this.type = row.type();
		this.externalId = row.externalId();
		this.title = cut(row.title(), 300);
		this.publisher = row.publisher() == null ? null : cut(row.publisher(), 100);
		this.publishedDate = row.date();
		this.url = row.url();
		this.weight = row.weight();
	}

	private static String cut(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}

	Long getEventId() {
		return eventId;
	}

	EventDtos.EvidenceRow row() {
		return new EventDtos.EvidenceRow(type, externalId, title, publisher, publishedDate, url, weight);
	}
}
