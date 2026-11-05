package com.flexable.web.config;

import java.io.IOException;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * /api 응답을 끝까지 모아 Content-Length를 붙여 보낸다.
 * 앞단(아카데미 프록시·Cloudflare)이 길이 없는 chunked 큰 응답을 중간에서 자르는 일이 있었다(2026-11-05, /youth-news 약 2.4MB가 24~100KB에서 끊겨
 * 화면이 예시 소식으로 대체됨). 길이가 있는 정적 파일(899KB)은 끊기지 않았다. 스트리밍 응답은 이 API에 없다.
 */
@Component
class ContentLengthFilter extends OncePerRequestFilter {

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !request.getRequestURI().startsWith("/api/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
		try {
			chain.doFilter(request, wrapped);
		} finally {
			wrapped.copyBodyToResponse();
		}
	}
}
