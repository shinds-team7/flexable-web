package com.flexable.web.seedmoney;

import java.time.Clock;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.flexable.web.applink.AppLinkService;
import com.flexable.web.common.ApiException;
import com.flexable.web.seedmoney.SeedMoneyDtos.Manual;
import com.flexable.web.seedmoney.SeedMoneyDtos.SeedMoneyResponse;
import com.flexable.web.user.UserWithdrawalListener;

/** 시드머니의 공개 입구. 앱 연동 갱신 규칙은 applink가 소유하고, 웹에서 직접 고친 값은 이 패키지가 가진다. */
@Service
public class SeedMoneyService implements UserWithdrawalListener {
	private final AppLinkService appLinks;
	private final SeedMoneyManualRepository manuals;
	private final Clock clock;

	public SeedMoneyService(AppLinkService appLinks, SeedMoneyManualRepository manuals, Clock clock) {
		this.appLinks = appLinks;
		this.manuals = manuals;
		this.clock = clock;
	}

	/** 저장한 값만 읽는다. 앱 연동 값은 applink에 저장된 마지막 값이고(앱 서버를 부르지 않음), 직접 고친 값은 따로 읽는다. */
	public SeedMoneyResponse get(long userId) {
		var link = appLinks.status(userId);
		return SeedMoneyResponse.of(link, Manual.of(manuals.findById(userId).orElse(null)));
	}

	public SeedMoneyResponse putManual(long userId, Long total) {
		if (total == null || total < 0 || total > SeedMoneyDtos.MAX_MANUAL_TOTAL) {
			throw ApiException.invalid("total", "시드머니는 0원 ~ 10억 원 사이로 넣어 주세요");
		}
		try {
			save(userId, total);
		}
		catch (DataIntegrityViolationException e) {
			// 같은 회원의 첫 저장이 동시에 들어와 한쪽이 먼저 만들었다. 다시 읽어 덮어쓴다.
			save(userId, total);
		}
		return get(userId);
	}

	private void save(long userId, long total) {
		SeedMoneyManual m = manuals.findById(userId).orElseGet(() -> new SeedMoneyManual(userId));
		m.change(total, clock.instant());
		manuals.save(m);
	}

	/** 앱 기록 기준으로 되돌린다. 없어도 그대로 끝난다. */
	public void deleteManual(long userId) {
		manuals.deleteById(userId);
	}

	@Override
	public void onWithdraw(long userId) {
		manuals.deleteById(userId);
	}
}
