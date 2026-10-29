package com.flexable.web.ingest;

import java.util.List;

import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;

/**
 * 사건 AI 개요 작성기(worker만 부른다, decisions/2026-10-29-event-ai-summary). 사건마다 1~3문장 개요를 쓴다.
 * 사람 검수 없이 화면에 나가므로 구현은 검사(입력에 없는 숫자·원인 단정·권유·전망 표현·길이)를 통과한 문장만 돌려주고,
 * 통과하지 못한 사건은 summary=null로 돌려준다.
 */
public interface EventOverviewWriter {

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 개요 단계를 건너뛴다(사건 상세는 사실 문장만). */
	boolean enabled();

	/** 한 번 호출로 묶어 쓴다. 응답에 없는 사건은 결과에서 빠진다(다음 실행에 다시 한다). 호출이 실패하면 예외 */
	List<OverviewResult> write(List<OverviewTarget> batch);
}
