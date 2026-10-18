package com.smartbill.bill;

import com.smartbill.common.Enums.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "bills")
public class Bill {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "user_id") public Long userId;
    public String name;
    @Enumerated(EnumType.STRING) public BillCategory category;
    public String provider;
    @Column(name = "expected_amount") public BigDecimal expectedAmount;
    @Column(name = "is_variable") public boolean variable;
    @Enumerated(EnumType.STRING) public Frequency frequency;
    @Column(name = "custom_interval_value") public Integer customIntervalValue;
    @Enumerated(EnumType.STRING) @Column(name = "custom_interval_unit") public CustomUnit customIntervalUnit;
    @Column(name = "anchor_date") public LocalDate anchorDate;
    @Column(name = "month_end_anchored") public boolean monthEndAnchored;
    @Column(name = "end_date") public LocalDate endDate;
    @JdbcTypeCode(SqlTypes.ARRAY) @Column(name = "reminder_days", columnDefinition = "integer[]") public Integer[] reminderDays;
    public String notes;
    @Column(name = "is_active") public boolean active = true;
    @Column(name = "created_at", insertable = false, updatable = false) public Instant createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false) public Instant updatedAt;
}
