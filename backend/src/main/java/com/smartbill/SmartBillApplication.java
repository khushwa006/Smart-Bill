package com.smartbill;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SmartBillApplication {
    public static void main(String[] args) {
        SpringApplication.run(SmartBillApplication.class, args);
    }
}
