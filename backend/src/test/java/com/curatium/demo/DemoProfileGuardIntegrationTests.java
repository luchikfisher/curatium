package com.curatium.demo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.context.ApplicationContext;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@ActiveProfiles("demo")
@Testcontainers
class DemoProfileGuardIntegrationTests {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void demoProfileAloneDoesNotCreateTheSeederOrAnyDemoData() {
        assertTrue(applicationContext.getBeansOfType(DemoShowcaseSeeder.class).isEmpty());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM exhibitions", Integer.class));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM demo_showcase_seeds", Integer.class));
    }
}
