package com.flexable.web.market;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** 사건·근거를 market 밖(ingest, 이후 API)으로 주고받는 값. */
public final class EventDtos {

	private EventDtos() {
	}

	/** 근거를 찾아야 할 종목 사건. from~to(포함) 사이 공시를 찾는다. */
	public record PendingEvidence(long eventId, String code, String corpCode, LocalDate from, LocalDate to) {
	}

	/** 근거 한 줄. type: DART. weight는 보고서 이름 키워드 점수(클수록 앞). */
	public record EvidenceRow(String type, String externalId, String title, String publisher, LocalDate date, String url, int weight) {
	}

	/** 저장된 사건. returnRate·marketReturn은 비율(0.05 = 5%). */
	public record EventView(long id, String code, String scope, LocalDate startDate, LocalDate endDate, int windowDays, String direction,
			double returnRate, Double marketReturn, double score, int rankInYear, List<EvidenceRow> sources) {
	}

	/** 사건 설명 고지(03 §8-3 EVENT_EXPLAIN). */
	public static final String NOTICE_KEY = "EVENT_EXPLAIN";
	public static final String NOTICE = "공시·시세 자료로 지난 일을 정리한 설명이에요. 실제 원인은 다를 수 있고, 이 종목을 사거나 팔라는 뜻이 아니에요.";

	/**
	 * 사건 상세(서버 계산). 수익률은 비율, 아직 그날이 안 왔거나 시세가 없으면 null.
	 * whatHappened: 수치로 만든 사실 문장(whatHappened 메서드). AI가 쓰지 않으므로 aiGenerated는 false다.
	 * aiSummary: worker가 미리 만든 AI 개요(decisions/2026-10-29-event-ai-summary). 없거나 공개를 멈췄으면 null.
	 */
	public record EventDetail(long id, String code, String name, String scope, LocalDate startDate, LocalDate endDate, int windowDays,
			String direction, String headline, MarketReaction marketReaction, Afterwards afterwards, List<EvidenceRow> sources,
			String newsSearchUrl, String whatHappened, List<Object> whyItMoved, boolean aiGenerated, AiSummary aiSummary, String confidence,
			String noticeKey, String notice) {
	}

	/** AI 개요 한 칸. model: 만든 모델 이름(예시 작성기면 "sample"), generatedAt: 만든 시각(+09:00), isSample: 예시 작성기가 쓴 문장 */
	public record AiSummary(String text, String model, OffsetDateTime generatedAt, boolean isSample) {
	}

	/**
	 * AI 개요 작성기에 보내는 사건 하나. 공개 시장 자료만 담는다: 이름·기간·등락률·시장 대비·거래량 배수·DART 공시 제목.
	 * 네이버 뉴스 기사는 넣지 않는다(검색 API 특약, decisions/2026-10-28-event-news). 값은 화면과 같은 글자로 만든다(+4.2%, 3.1배).
	 * marketReturn·volumeRatio는 없으면 null, disclosures는 시장 사건이면 비어 있다.
	 */
	public record OverviewInput(long id, String scope, String name, String period, int windowDays, String direction, String returnRate,
			String marketReturn, String volumeRatio, List<String> disclosures) {
	}

	/** 개요를 만들 사건과 입력 지문(입력이 바뀌면 지문이 바뀐다). */
	public record OverviewTarget(OverviewInput input, String inputHash) {
	}

	/** 작성기 결과. summary가 null이면 검사 탈락(문장 없이 지문만 남긴다). */
	public record OverviewResult(long eventId, String inputHash, String summary, String model, boolean sample) {
	}

	/** returnRate: 사건 기간 종목, marketReturn: 같은 기간 시장 대용, volumeRatio: 거래량 배수, weekReturn: 마지막 날까지 5거래일 */
	public record MarketReaction(double returnRate, Double marketReturn, Double volumeRatio, Double weekReturn) {
	}

	/** 사건 마지막 날 종가 대비 30일·365일 뒤(휴장이면 다음 거래일) 수익률. 아직 안 왔으면 null. */
	public record Afterwards(Double d30, Double d365) {
	}

	/**
	 * 설명(LLM) 전 제목. 원인을 단정하지 않게 이름·기간·방향만 쓴다. 예: "삼성전자 하루 급등", "시장 전체 5거래일 급락".
	 */
	public static String headline(String name, String scope, String direction, int windowDays) {
		String who = "MARKET".equals(scope) ? "시장 전체" : name;
		String days = windowDays == 1 ? "하루" : windowDays + "거래일";
		return who + " " + days + " " + ("RISE".equals(direction) ? "급등" : "급락");
	}

	/**
	 * 설명 전 "무슨 일": 원인을 말하지 않고 기간·등락률·시장 비교·공시 수만 쓴다.
	 * 예: "삼성전자 주가가 2024.01.19 하루 +4.2% 올랐어요. 같은 기간 시장 전체는 +1.0%였어요. 이 기간에 공시 3건이 나왔어요."
	 */
	public static String whatHappened(String name, String scope, LocalDate start, LocalDate end, int windowDays, double returnRate,
			Double marketReturn, int sourceCount) {
		String when = windowDays == 1 ? dot(start) + " 하루" : dot(start) + "~" + dot(end) + " " + windowDays + "거래일 동안";
		String moved = returnRate >= 0 ? "올랐어요" : "내렸어요";
		if ("MARKET".equals(scope)) {
			return "시장 전체(코스피200 추종 ETF)가 " + when + " " + pct(returnRate) + " " + moved + ". 특정 회사 공시와 연결하지 않은 시장 전체 움직임이에요.";
		}
		StringBuilder s = new StringBuilder(name + " 주가가 " + when + " " + pct(returnRate) + " " + moved + ".");
		if (marketReturn != null) {
			s.append(" 같은 기간 시장 전체는 ").append(pct(marketReturn)).append("였어요.");
		}
		s.append(sourceCount > 0 ? " 이 기간에 공시 " + sourceCount + "건이 나왔어요." : " 이 기간에 확인된 주요 공시는 없어요.");
		return s.toString();
	}

	/** +4.2%, −3.5%(화면과 같은 빼기 기호) */
	static String pct(double x) {
		return (x >= 0 ? "+" : "−") + String.format("%.1f%%", Math.abs(x * 100));
	}

	private static String dot(LocalDate d) {
		return d.toString().replace('-', '.');
	}

	/**
	 * 사건 무렵 뉴스(GET /market/events/{id}/news, decisions/2026-10-28-event-news). from~to는 기사 발행일 범위(KST, 포함).
	 * status: OK | UNAVAILABLE(키 없음·호출 실패·하루 한도). 저장하지 않고 요청마다 검색한 결과다.
	 */
	public record EventNews(long eventId, LocalDate from, LocalDate to, String status, List<NewsItem> items, String sourceName,
			String notice, boolean isSample) {
	}

	/** 기사 한 건: 원문 제목·원문 링크·언론사 주소(원문 링크 호스트, 없으면 null)·발행 시각(+09:00). */
	public record NewsItem(String title, String url, String publisher, OffsetDateTime publishedAt) {
	}

	/** 한 종목 탐지 결과: 저장(새로·갱신)한 수와 지운 수. */
	public record DetectResult(int saved, int removed) {
	}
}
