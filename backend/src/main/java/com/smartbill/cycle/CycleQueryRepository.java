package com.smartbill.cycle;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class CycleQueryRepository {
    private final JdbcTemplate jdbc;
    public CycleQueryRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final RowMapper<CycleView> MAPPER = (rs, i) -> new CycleView(
            rs.getLong("id"), rs.getLong("bill_id"), rs.getString("bill_name"), rs.getString("category"),
            rs.getString("provider"), rs.getObject("period_start", LocalDate.class),
            rs.getObject("period_end", LocalDate.class), rs.getObject("issue_date", LocalDate.class),
            rs.getObject("due_date", LocalDate.class), rs.getBigDecimal("expected_amount"),
            rs.getBigDecimal("actual_amount"), rs.getBigDecimal("amount_payable"), rs.getBoolean("is_confirmed"),
            rs.getBigDecimal("paid_amount"), rs.getBigDecimal("outstanding_amount"),
            rs.getBoolean("is_partially_paid"), rs.getString("status"), rs.getString("notes"));

    private static final String SELECT = "SELECT * FROM billing_cycle_status WHERE user_id = ?";

    public List<CycleView> forBill(Long userId, Long billId) {
        return jdbc.query(SELECT + " AND bill_id = ? ORDER BY due_date DESC", MAPPER, userId, billId);
    }

    public Optional<CycleView> find(Long userId, Long cycleId) {
        return jdbc.query(SELECT + " AND id = ?", MAPPER, userId, cycleId).stream().findFirst();
    }

    public List<CycleView> list(Long userId, LocalDate from, LocalDate to, String status) {
        StringBuilder sql = new StringBuilder(SELECT);
        List<Object> args = new ArrayList<>(List.of(userId));
        if (from != null) { sql.append(" AND due_date >= ?"); args.add(from); }
        if (to != null) { sql.append(" AND due_date <= ?"); args.add(to); }
        if (status != null && !status.isBlank()) { sql.append(" AND status = ?"); args.add(status.toUpperCase()); }
        sql.append(" ORDER BY due_date, id");
        return jdbc.query(sql.toString(), MAPPER, args.toArray());
    }
}
