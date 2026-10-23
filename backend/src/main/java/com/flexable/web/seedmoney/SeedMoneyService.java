package com.flexable.web.seedmoney;

import org.springframework.stereotype.Service;

import com.flexable.web.applink.AppLinkService;
import com.flexable.web.seedmoney.SeedMoneyDtos.SeedMoneyResponse;

/** 시드머니의 공개 입구. 앱 연동 갱신 규칙은 applink가 소유한다. */
@Service
public class SeedMoneyService {
	private final AppLinkService appLinks;

	public SeedMoneyService(AppLinkService appLinks) {
		this.appLinks = appLinks;
	}

	public SeedMoneyResponse get(long userId) {
		return SeedMoneyResponse.of(appLinks.status(userId));
	}
}
