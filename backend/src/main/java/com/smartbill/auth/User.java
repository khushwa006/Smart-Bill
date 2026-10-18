package com.smartbill.auth;

import jakarta.persistence.*;
import java.time.Instant;

/** Public fields keep the unverified Stage-2 code compact; Hibernate uses field access (@Id on a field). */
@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    public String email;
    @Column(name = "password_hash") public String passwordHash;
    @Column(name = "full_name") public String fullName;
    public String timezone;
    @Column(name = "is_demo") public boolean demo;
    @Column(name = "failed_login_count") public int failedLoginCount;
    @Column(name = "locked_until") public Instant lockedUntil;
    @Column(name = "created_at", insertable = false, updatable = false) public Instant createdAt;
}
