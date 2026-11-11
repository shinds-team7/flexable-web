package com.flexable.web.virtualsim;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

/**
 * 시작 요청의 leverage(policies §8-9). 생략하면 null(= 1배)이고, 명시적 null·정수가 아닌 값은 계약에 없어 400(VALIDATION_FAILED)이다.
 * Jackson은 생략된 생성자 인자를 getAbsentValue로, 명시적 null을 getNullValue로 채운다(@JsonSetter(nulls = FAIL)은 생략까지 막는다)
 */
public class LeverageDeserializer extends StdDeserializer<Integer> {
	public LeverageDeserializer() {
		super(Integer.class);
	}

	@Override
	public Integer deserialize(JsonParser parser, DeserializationContext context) {
		if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) {
			return (Integer) context.handleUnexpectedToken(Integer.class, parser);
		}
		return parser.getIntValue();
	}

	@Override
	public Object getNullValue(DeserializationContext context) {
		return context.reportInputMismatch(this, "leverage는 null일 수 없어요");
	}

	@Override
	public Object getAbsentValue(DeserializationContext context) {
		return null;
	}
}
