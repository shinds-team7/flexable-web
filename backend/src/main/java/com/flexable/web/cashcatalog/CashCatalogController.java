package com.flexable.web.cashcatalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.flexable.web.cashcatalog.CashCatalogDtos.ProductList;

@RestController
public class CashCatalogController {
    private final CashCatalogService catalog;
    public CashCatalogController(CashCatalogService catalog) { this.catalog = catalog; }
    @GetMapping("/api/v1/parking/products")
    ProductList parking() { return catalog.list("parking"); }
    @GetMapping("/api/v1/cma/products")
    ProductList cma() { return catalog.list("cma"); }
}
