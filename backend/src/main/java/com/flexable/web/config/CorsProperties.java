package com.flexable.web.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 운영은 프록시 뒤 같은 출처라 CORS가 필요 없다. 로컬 개발 서버(Vite)처럼 다른 출처만 넣는다. */
@ConfigurationProperties("app")
public record CorsProperties(List<String> corsOrigins) {
}
