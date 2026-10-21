package com.flexable.web.ingest;

import java.util.List;

/** 한 시장의 종목 전체. note는 대체 소스를 쓴 이유 등 화면에 붙일 설명(없으면 null). */
public record InstrumentListing(List<InstrumentInfo> items, String source, String note) {
}
