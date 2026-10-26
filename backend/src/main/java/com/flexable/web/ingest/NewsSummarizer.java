package com.flexable.web.ingest;

import java.util.List;

import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

/**
 * 소식 카드 요약기(worker만 부른다, 2026-10-26 결정). 원문(정책설명·지원내용)을 1~3문장으로 줄인다.
 * 사람 검수 없이 화면에 나가므로 구현은 검사(원문에 없는 숫자·길이·금지어)를 통과한 요약만 돌려주고, 통과하지 못한 건은 summary=null로 돌려준다.
 */
public interface NewsSummarizer {

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 요약 단계를 건너뛴다(수집·게시는 그대로). */
	boolean enabled();

	/** 한 번 호출로 묶어 요약한다. 응답에 없는 카드는 결과에서 빠진다(다음 실행에 다시 한다). 호출이 실패하면 예외 */
	List<SummaryResult> summarize(List<SummaryTarget> batch);
}
