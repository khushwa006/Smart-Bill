package com.smartbill.subscription;

import com.smartbill.common.Enums.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "subscriptions")
public class Subscription {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "user_id") public Long userId;
    @Column(name = "service_name") public String serviceName;
    @Enumerated(EnumType.STRING) public SubscriptionCategory category;
    public String provider;
    public BigDecimal amount;
    @Enumerated(EnumType.STRING) public Frequency frequency;
    @Column(name = "custom_interval_value") public Integer customIntervalValue;
    @Enumerated(EnumType.STRING) @Column(name = "custom_interval_unit") public CustomUnit customIntervalUnit;
    @Column(name = "start_date") public LocalDate startDate;
    @Column(name = "next_renewal_date") public LocalDate nextRenewalDate;
    @Column(name = "end_date") public LocalDate endDate;
    @Column(name = "trial_end_date") public LocalDate trialEndDate;
    @Enumerated(EnumType.STRING) public SubscriptionState state = SubscriptionState.ACTIVE;
    @Column(name = "cancelled_at") public Instant cancelledAt;
    @JdbcTypeCode(SqlTypes.ARRAY) @Column(name = "reminder_days", columnDefinition = "integer[]") public Integer[] reminderDays;
    public String notes;
    @Column(name = "created_at", insertable = false, updatable = false) public Instant createdAt;
}
