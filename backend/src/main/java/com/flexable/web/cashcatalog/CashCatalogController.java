package com.flexable.web.cashcatalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import com.flexable.web.cashcatalog.CashCatalogDtos.CmaSimulation;
import com.flexable.web.cashcatalog.CashCatalogDtos.ParkingSimulateRequest;
import com.flexable.web.cashcatalog.CashCatalogDtos.ParkingSimulation;
import com.flexable.web.cashcatalog.CashCatalogDtos.ProductList;

@RestController
public class CashCatalogController {
    private final CashCatalogService catalog;
    public CashCatalogController(CashCatalogService catalog) { this.catalog = catalog; }
    @GetMapping("/api/v1/parking/products")
    ProductList parking() { return catalog.list("parking"); }
    @PostMapping("/api/v1/parking/simulate")
    ParkingSimulation parkingSimulate(@RequestBody ParkingSimulateRequest request) { return catalog.simulateParking(request); }
    @PostMapping("/api/v1/cma/simulate")
    CmaSimulation cmaSimulate(@RequestBody ParkingSimulateRequest request) { return catalog.simulateCma(request); }
    @GetMapping("/api/v1/cma/products")
    ProductList cma() { return catalog.list("cma"); }
}
