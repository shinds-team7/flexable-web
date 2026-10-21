package com.flexable.web.ingest;

import java.time.LocalDate;

/** 공시 한 건. receiptNo는 DART 접수번호(14자리), filer는 제출인, date는 접수일. */
public record Disclosure(String receiptNo, String reportName, String filer, LocalDate date) {
}
