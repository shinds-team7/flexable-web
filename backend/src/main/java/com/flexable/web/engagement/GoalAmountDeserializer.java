package com.flexable.web.engagement;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

/** 금액 소수를 Long으로 묵시적으로 잘라 저장하지 않는다. API의 원 단위 정수만 받는다. */
public class GoalAmountDeserializer extends StdDeserializer<Long> {
	public GoalAmountDeserializer() {
		super(Long.class);
	}

	@Override
	public Long deserialize(JsonParser parser, DeserializationContext context) {
		if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) {
			return (Long) context.handleUnexpectedToken(Long.class, parser);
		}
		return parser.getLongValue();
	}
}
