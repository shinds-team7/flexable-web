# ai

`GoalCoachClient`가 목표 안내의 외부 호출 경계다. `RestGoalCoachClient`는 Chat Completions strict JSON schema·`store:false`로 한 번 호출하고, 3초 연결·20초 응답 제한을 둔다. 키가 없으면 `enabled=false`다. 기본 안내·사용량·문장 검사는 `engagement`가 맡는다.

목표 종류·계산된 사실·허용 자리표시자 목록만 받고 회원 id·목표 이름·이메일을 받는 인자가 없다. 응답 거절·잘린 응답·HTTP/JSON 오류는 본문과 원인 예외를 버린 `AI_FAILED`로 바꾼다. 프롬프트·응답·키는 로그에 남기지 않는다.
