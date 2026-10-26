package com.flexable.web.news;

/**
 * 소식 분야(01 §F4, 디자인 X3 이름). 화면 탭 이름: 교통·주거·저축·금융·일자리·교육·생활·문화·세금·기타.
 * 소식 하나가 여러 분야에 들 수 있다(예: 온통청년 대분류 '금융･복지･문화' → FINANCE·CULTURE). 어느 분야에도 맞지 않으면 ETC(기타).
 */
public enum NewsCategory {
	TRANSPORT, HOUSING, FINANCE, JOB, EDUCATION, CULTURE, TAX, ETC
}
