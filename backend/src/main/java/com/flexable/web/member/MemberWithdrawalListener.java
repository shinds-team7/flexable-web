package com.flexable.web.member;

/**
 * 웹 탈퇴 때 자기 패키지의 웹 데이터를 지우는 쪽이 구현한다. member는 이 패키지들에 의존하지 않으므로
 * (의존 방향은 backend/README.md 표) 이 인터페이스로 거꾸로 부른다. members 행을 지우기 전, 같은 트랜잭션에서 불린다.
 */
public interface MemberWithdrawalListener {

	void onWithdraw(long memberId);
}
