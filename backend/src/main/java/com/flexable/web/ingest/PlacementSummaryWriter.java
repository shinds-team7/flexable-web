package com.flexable.web.ingest;

import java.util.List;
import java.util.Set;

/**
 * 배치고사 공시 AI 요약 작성기(worker만 부른다, decisions/2026-11-09-placement-ai-summary). 공시 본문 글마다 2~5문장 요약을 쓴다.
 * 사람 검수 없이 문제 화면에 나가므로 구현은 자동 검사(PlacementSummaries.check)를 통과한 요약만 summary에 담고, 걸리면 summary=null·reject에 까닭을 담는다.
 */
public interface PlacementSummaryWriter {

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 요약 단계를 건너뛴다(문제는 공시 주요 내용·유형 설명으로 나간다) */
	boolean enabled();

	/** 저장 행에 남길 모델 이름 */
	String model();

	/** 공시 한 건의 입력. id: 접수번호, type: 유형 이름, text: 본문 글(보낼 만큼 자른 것), names: 요약에 들어가면 버리는 이름(보내지 않는다) */
	record Input(String id, String type, String title, String text, Set<String> names) {
	}

	/**
	 * summary: 검사를 통과한 요약(아니면 null), reject: 걸린 까닭(통과하면 null), problem: 다시 쓰기 안내(PlacementSummaries.feedback, 통과하면 null),
	 * draft: 걸린 요약 글(다시 쓰기에 보낸다). problem·draft는 저장·로그에 남기지 않는다
	 */
	record Result(String id, String summary, String reject, String problem, String draft) {

		public Result(String id, String summary, String reject) {
			this(id, summary, reject, null, null);
		}
	}

	/** 다시 쓰기 한 건: 처음 입력, 걸린 요약 글, 다시 쓰기 안내 */
	record Retry(Input input, String draft, String problem) {
	}

	/** 한 번 호출로 묶어 쓴다. 응답에 없는 공시는 결과에서 빠진다(다음 실행에 다시 한다). 호출이 실패하면 예외 */
	List<Result> write(List<Input> batch);

	/** 검사에 걸린 요약을 까닭과 함께 한 번 호출로 다시 쓰게 한다(공시마다 한 번만). 결과·실패는 write와 같다 */
	List<Result> rewrite(List<Retry> retries);
}
