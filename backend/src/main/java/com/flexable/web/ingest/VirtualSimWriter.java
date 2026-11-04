package com.flexable.web.ingest;

import java.util.List;

import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimSample.Draft;

/**
 * 가상 회사·사건 글 작성기(worker만 부른다, decisions/2026-11-04-virtual-simulation 4). 회사마다 이름·한 줄 소개·사건 유형별 본문을 쓴다.
 * 입력은 업종 이름과 사건 유형(코드·이름·화면 제목)뿐이고 뉴스·실제 공시 원문·실제 회사명·등락 통계·회원 정보는 보내지 않는다.
 * 검사(VirtualSimChecker)는 VirtualSimContentJob이 한다.
 */
public interface VirtualSimWriter {

	/** 회사 한 곳의 요청. industry는 서버 업종 목록(vsim-industries-v1)에서 고른 이름 */
	record Request(int id, String industry, List<VirtualSimCategory> categories) {
	}

	/** 요청 id와 쓴 글. 응답에 없는 회사는 빠진다 */
	record Written(int id, Draft draft) {
	}

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 생성 단계를 건너뛴다 */
	boolean enabled();

	/** 바깥 API 없이 예시 글을 쓰는 작성기(VIRTUAL_SIM_SOURCE=fake)면 true. 하루 호출 수에 세지 않는다 */
	default boolean sample() {
		return false;
	}

	String model();

	/** 프롬프트(작성 규칙) 버전. 회사 행에 함께 저장한다 */
	String promptVersion();

	/** 한 번 호출로 묶어 쓴다. 호출이 실패하면 예외 */
	List<Written> write(List<Request> batch);
}
