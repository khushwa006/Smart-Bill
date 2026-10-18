package com.smartbill.bill;

import com.smartbill.bill.BillDtos.*;
import com.smartbill.common.ApiException;
import com.smartbill.cycle.CycleService;
import com.smartbill.cycle.CycleView;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bills")
public class BillController {
    private final BillService service;
    private final CycleService cycles;

    public BillController(BillService service, CycleService cycles) {
        this.service = service;
        this.cycles = cycles;
    }

    @GetMapping
    public List<BillResponse> list(@AuthenticationPrincipal Long userId,
                                   @RequestParam(required = false) String q,
                                   @RequestParam(required = false) String category,
                                   @RequestParam(required = false) Boolean active,
                                   @RequestParam(required = false) String sort,
                                   @RequestParam(required = false) String dir) {
        return service.search(userId, q, category, active, sort, dir).stream().map(BillResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BillResponse create(@AuthenticationPrincipal Long userId, @Valid @RequestBody BillRequest req) {
        return BillResponse.from(service.create(userId, req));
    }

    @GetMapping("/{id}")
    public BillResponse get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return BillResponse.from(service.get(userId, id));
    }

    @PutMapping("/{id}")
    public BillResponse update(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                               @Valid @RequestBody BillRequest req) {
        return BillResponse.from(service.update(userId, id, req));
    }

    /** Destructive: the client must pass confirm=true after showing its confirmation dialog. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                       @RequestParam(defaultValue = "false") boolean confirm) {
        if (!confirm) throw ApiException.badRequest("Deletion must be confirmed (confirm=true)");
        service.delete(userId, id);
    }

    @GetMapping("/{id}/history")
    public List<CycleView> history(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        service.get(userId, id);   // ownership check first
        return cycles.history(userId, id);
    }
}
