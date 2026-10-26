package com.flexable.web.practice;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.flexable.web.practice.PracticeDtos.*;

@RestController
@RequestMapping("/api/v1/practice")
public class PracticeController {
    private final PracticeService service;
    public PracticeController(PracticeService service) { this.service = service; }
    private static <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/categories") public ResponseEntity<Categories> categories() { return response(service.categories()); }
    @PostMapping("/start") public ResponseEntity<Started> start(@Valid @RequestBody Start input) { return response(service.start(input)); }
    @PostMapping("/state") public ResponseEntity<Snapshot> state(@Valid @RequestBody Token input) { return response(service.state(input.sessionToken())); }
    @PostMapping("/step") public ResponseEntity<Snapshot> step(@Valid @RequestBody Command input) { return response(service.step(input)); }
    @PostMapping("/decision") public ResponseEntity<Snapshot> decide(@Valid @RequestBody Decision input) { return response(service.decide(input)); }
    @PostMapping("/end") public ResponseEntity<Void> end(@Valid @RequestBody Token input) {
        service.end(input.sessionToken()); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
