package com.flexable.web.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.ai.openai")
public record OpenAiProperties(@DefaultValue("") String apiKey,
		@DefaultValue("https://api.openai.com/v1") String baseUrl, @DefaultValue("gpt-4o-mini") String model) {
	public OpenAiProperties {
		baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.openai.com/v1" : baseUrl;
		model = model == null || model.isBlank() ? "gpt-4o-mini" : model;
	}
	public boolean configured() {
		return apiKey != null && !apiKey.isBlank();
	}

	@Override
	public String toString() {
		return "OpenAiProperties[configured=" + configured() + "]";
	}
}
