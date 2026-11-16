package com.flexable.web.ingest;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.flexable.web.deposit.DepositCatalogService;
import com.flexable.web.savings.FinlifeCompanyCatalog;
import com.flexable.web.savings.SavingsCatalogService;

/** 금융회사 수집(#449)은 상품 수집과 따로 돌아서, 실패해도 적금·정기예금 반영과 기존 주소는 그대로다. */
class SavingsSnapshotJobTest {

	private final FinlifeClient finlife = mock(FinlifeClient.class);
	private final YouthCenterClient youthCenter = mock(YouthCenterClient.class);
	private final SavingsCatalogService catalog = mock(SavingsCatalogService.class);
	private final DepositCatalogService deposits = mock(DepositCatalogService.class);
	private final FinlifeCompanyCatalog companies = mock(FinlifeCompanyCatalog.class);
	private final SavingsSnapshotJob job = new SavingsSnapshotJob(finlife, youthCenter, catalog, deposits, companies);

	@Test
	void 금융회사_수집이_실패해도_상품은_반영한다() {
		when(finlife.configured()).thenReturn(true);
		when(finlife.fetchAll()).thenReturn(List.of());
		when(finlife.fetchAllDeposits()).thenReturn(List.of());
		when(finlife.fetchCompanies()).thenThrow(new IllegalStateException("finlife 호출 실패"));

		job.daily();

		verify(catalog).replaceAll(anyList());
		verify(deposits).replaceAll(anyList());
		verify(companies, never()).replaceAll(anyList());
	}

	@Test
	void 금융회사_목록을_받으면_교체한다() {
		when(finlife.configured()).thenReturn(true);
		when(finlife.fetchCompanies()).thenReturn(List.of(new FinlifeCompanyCatalog.CompanyData("0010001", "예시은행", "http://www.example-bank.co.kr")));

		job.syncCompanies();

		verify(companies).replaceAll(List.of(new FinlifeCompanyCatalog.CompanyData("0010001", "예시은행", "http://www.example-bank.co.kr")));
	}

	@Test
	void 인증키가_없으면_건너뛴다() {
		when(finlife.configured()).thenReturn(false);

		job.syncCompanies();

		verify(finlife, never()).fetchCompanies();
	}
}
