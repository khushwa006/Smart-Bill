package com.smartbill.payment;

import com.smartbill.bill.BillService;
import com.smartbill.payment.PaymentDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class PaymentController {
    private final PaymentService service;
    private final BillService bills;

    public PaymentController(PaymentService service, BillService bills) {
        this.service = service;
        this.bills = bills;
    }

    @GetMapping("/payments")
    public List<PaymentResponse> list(@AuthenticationPrincipal Long userId) {
        return service.list(userId).stream().map(PaymentResponse::from).toList();
    }

    @PostMapping("/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse record(@AuthenticationPrincipal Long userId, @Valid @RequestBody PaymentRequest req) {
        return PaymentResponse.from(service.record(userId, req));
    }

    @PostMapping("/payments/{id}/reverse")
    public PaymentResponse reverse(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                   @Valid @RequestBody ReverseRequest req) {
        return PaymentResponse.from(service.reverse(userId, id, req.reason()));
    }

    @GetMapping("/bills/{id}/payments")
    public List<PaymentResponse> forBill(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        bills.get(userId, id);   // ownership check first
        return service.forBill(userId, id).stream().map(PaymentResponse::from).toList();
    }
}
