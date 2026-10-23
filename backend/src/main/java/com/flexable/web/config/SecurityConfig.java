package com.flexable.web.config;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.flexable.web.auth.TokenAuthenticationConverter;
import com.flexable.web.auth.TokenService;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.common.ErrorResponses;

@Configuration
public class SecurityConfig {

	private static final String UNAUTHORIZED_BODY = ErrorResponses.json(ErrorCode.UNAUTHORIZED);

	/** worker 프로필(HTTP 없음)에서는 필터 체인을 만들지 않는다. */
	@Bean
	@ConditionalOnWebApplication
	SecurityFilterChain filterChain(HttpSecurity http, TokenService tokens, TokenAuthenticationConverter converter)
			throws Exception {
		AuthenticationEntryPoint entryPoint = (request, response, ex) -> {
			response.setStatus(ErrorCode.UNAUTHORIZED.status().value());
			response.setContentType("application/json;charset=UTF-8");
			response.getWriter().write(UNAUTHORIZED_BODY);
		};
		http.csrf(csrf -> csrf.disable())
			.cors(Customizer.withDefaults())
			.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/v1/auth/signup", "/api/v1/auth/login", "/api/v1/auth/oauth/exchange").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/v1/auth/oauth/providers",
						"/api/v1/auth/oauth/*/start", "/api/v1/auth/oauth/*/callback").permitAll()
				// 시세·시뮬레이션은 공개(03 §8-1). 비로그인 체험도 같은 계산을 쓴다
				.requestMatchers(HttpMethod.GET, "/api/v1/market/**").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/v1/youth-news").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/v1/simulations/run").permitAll()
				.requestMatchers("/api/v1/health", "/actuator/health/**", "/error").permitAll()
				.anyRequest().authenticated())
			.oauth2ResourceServer(rs -> rs
				.authenticationEntryPoint(entryPoint)
				.jwt(jwt -> jwt.decoder(tokens.decoder()).jwtAuthenticationConverter(converter)))
			.exceptionHandling(e -> e.authenticationEntryPoint(entryPoint));
		return http.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(CorsProperties props) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(props.corsOrigins());
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}
}
