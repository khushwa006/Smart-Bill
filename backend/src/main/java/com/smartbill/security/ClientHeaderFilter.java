package com.smartbill.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * CSRF defence for cookie auth: every state-changing /api request must carry a custom header.
 * Browsers cannot attach custom headers cross-origin without a CORS preflight, and CORS only
 * allows FRONTEND_ORIGIN, so a hostile site cannot forge these requests.
 */
public class ClientHeaderFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-SmartBill-Client";
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        boolean needs = req.getRequestURI().startsWith("/api/") && !SAFE.contains(req.getMethod());
        if (needs && req.getHeader(HEADER) == null) {
            res.setStatus(403);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Missing client header\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
