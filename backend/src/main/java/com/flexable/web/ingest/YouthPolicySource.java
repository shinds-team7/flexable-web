package com.flexable.web.ingest;

import java.util.List;

import com.flexable.web.news.NewsDtos.PolicyDraft;

/**
 * 청년 정책(소식 초안) 소스(worker만 부른다). 구현을 바꾸려면 이 인터페이스를 구현하고
 * IngestConfig의 switch에 이름을 추가한 뒤 app.ingest.youth.source(YOUTH_POLICY_SOURCE) 값을 바꾼다.
 */
public interface YouthPolicySource {

	/** youth_news의 source 값(YOUTH_CENTER, FAKE) */
	String source();

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 수집을 건너뛴다. */
	boolean enabled();

	/** 지금 받을 수 있는 정책 전부(페이지를 넘겨 모은다). 원문은 PolicyDraft.payload에 그대로 담는다. */
	List<PolicyDraft> policies();
}
