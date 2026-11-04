package com.flexable.web.cashcatalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 출처·종류 단위 전체 스냅샷. 등록된 공식 수집 어댑터만 서비스 경계로 발행한다. */
@Entity
@Table(name = "cash_catalog_snapshots")
class CashSnapshot {
    @Id
    @Column(length = 36)
    String id;
    @Column(nullable = false, length = 10)
    String kind;
    @Column(name = "permission_reference", nullable = false, length = 2000)
    String permissionReference;
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    String payload;

    protected CashSnapshot() {}

    CashSnapshot(String id, String kind, String permissionReference, String payload) {
        this.id = id;
        this.kind = kind;
        this.permissionReference = permissionReference;
        this.payload = payload;
    }
}
