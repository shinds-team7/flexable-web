package com.flexable.web.market;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import com.flexable.web.market.PracticeMarketData.Dataset;

@Service
public class PracticeMarketService {
    private final PracticeDatasetRepository repository;
    private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();
    public PracticeMarketService(PracticeDatasetRepository repository) { this.repository = repository; }

    public static String categoryName(String name) {
        return name == null ? "" : Normalizer.normalize(name.trim(), Normalizer.Form.NFC);
    }
    public static String categoryCode(String name) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(categoryName(name).getBytes(StandardCharsets.UTF_8))).substring(0, 24);
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    @Transactional
    public void save(Dataset data) {
        if (data.candles().size() != 120 || data.candles().stream().anyMatch(c -> !c.valid())) {
            throw new IllegalArgumentException("120개의 유효 OHLC가 필요합니다");
        }
        for (int i = 1; i < data.candles().size(); i++) {
            if (data.candles().get(i - 1).date().compareTo(data.candles().get(i).date()) >= 0)
                throw new IllegalArgumentException("시세 날짜가 중복되거나 역순입니다");
        }
        repository.save(new PracticeDataset(data.instrument().code(), json.writeValueAsString(data)));
    }
    @Transactional(readOnly = true)
    public List<Dataset> all() {
        return repository.findAll().stream().map(row -> json.readValue(row.payload, Dataset.class)).toList();
    }
}
