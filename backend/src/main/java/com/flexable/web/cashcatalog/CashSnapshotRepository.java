package com.flexable.web.cashcatalog;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface CashSnapshotRepository extends JpaRepository<CashSnapshot, String> {
    List<CashSnapshot> findByKind(String kind);
}
