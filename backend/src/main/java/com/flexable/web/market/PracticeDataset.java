package com.flexable.web.market;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "practice_datasets")
class PracticeDataset {
    @Id @Column(length = 12) String code;
    @Column(name = "payload", columnDefinition = "LONGTEXT", nullable = false) String payload;
    protected PracticeDataset() { }
    PracticeDataset(String code, String payload) { this.code = code; this.payload = payload; }
}
