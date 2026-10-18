package com.smartbill.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Runs only when a THROWAWAY PostgreSQL is supplied (DATABASE_URL / DATABASE_USERNAME / DATABASE_PASSWORD
 * / JWT_SECRET set, and RUN_DB_TESTS=true). Never point this at production: it creates users.
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_DB_TESTS", matches = "true")
class ApiIntegrationTest {
    @Autowired MockMvc mvc;

    private Cookie register(String email) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/register").header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"Passw0rd!x\",\"fullName\":\"T\"}"))
                .andExpect(status().isCreated()).andReturn();
        return r.getResponse().getCookie("sb_token");
    }

    private static final String BILL = "{\"name\":\"Internet\",\"category\":\"INTERNET\",\"expectedAmount\":799.00,"
            + "\"frequency\":\"MONTHLY\",\"anchorDate\":\"2026-10-18\"}";

    @Test void unauthenticatedRequestsAre401() throws Exception {
        mvc.perform(get("/api/bills")).andExpect(status().isUnauthorized());
    }

    @Test void stateChangingRequestWithoutClientHeaderIs403() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.c\",\"password\":\"x\"}")).andExpect(status().isForbidden());
    }

    @Test void userCannotReadOrChangeAnotherUsersBill() throws Exception {
        Cookie alice = register("alice-" + UUID.randomUUID() + "@t.in");
        Cookie bob = register("bob-" + UUID.randomUUID() + "@t.in");
        String loc = mvc.perform(post("/api/bills").cookie(alice).header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON).content(BILL))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = loc.replaceAll(".*\"id\":(\\d+).*", "$1");
        mvc.perform(get("/api/bills/" + id).cookie(alice)).andExpect(status().isOk());
        mvc.perform(get("/api/bills/" + id).cookie(bob)).andExpect(status().isNotFound());
        mvc.perform(get("/api/bills/" + id + "/history").cookie(bob)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/bills/" + id + "?confirm=true").cookie(bob).header("X-SmartBill-Client", "test"))
                .andExpect(status().isNotFound());
    }

    @Test void paymentIsIdempotentAndCannotOverpay() throws Exception {
        Cookie u = register("pay-" + UUID.randomUUID() + "@t.in");
        mvc.perform(post("/api/bills").cookie(u).header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON).content(BILL)).andExpect(status().isCreated());
        String cycles = mvc.perform(get("/api/cycles").cookie(u)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String cycleId = cycles.replaceAll("(?s)^\\[\\{\"id\":(\\d+).*", "$1");
        String pay = "{\"billingCycleId\":" + cycleId + ",\"amount\":500,\"paidOn\":\"2026-10-16\","
                + "\"method\":\"UPI\",\"idempotencyKey\":\"k-1\"}";
        String first = mvc.perform(post("/api/payments").cookie(u).header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON).content(pay)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/payments").cookie(u).header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON).content(pay)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(first, second, "same idempotency key must return the same payment");
        String over = "{\"billingCycleId\":" + cycleId + ",\"amount\":500,\"paidOn\":\"2026-10-16\",\"method\":\"CASH\"}";
        mvc.perform(post("/api/payments").cookie(u).header("X-SmartBill-Client", "test")
                .contentType(MediaType.APPLICATION_JSON).content(over)).andExpect(status().isUnprocessableEntity());
    }
}
