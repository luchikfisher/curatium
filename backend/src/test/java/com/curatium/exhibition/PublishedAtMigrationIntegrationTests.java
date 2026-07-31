package com.curatium.exhibition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class PublishedAtMigrationIntegrationTests {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Test
    void backfillsLegacyPublishedExhibitionsWithoutChangingDrafts() {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .target("4")
                .load()
                .migrate();

        JdbcTemplate jdbcTemplate = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()
        ));
        long publishedExhibitionId = insertLegacyExhibition(
                jdbcTemplate,
                "PUBLISHED",
                "2026-07-20T10:30:00Z"
        );
        long draftExhibitionId = insertLegacyExhibition(
                jdbcTemplate,
                "DRAFT",
                "2026-07-21T11:45:00Z"
        );

        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertTrue(jdbcTemplate.queryForObject(
                "SELECT published_at = updated_at FROM exhibitions WHERE id = ?",
                Boolean.class,
                publishedExhibitionId
        ));
        assertEquals("2026-07-20 10:30:00", jdbcTemplate.queryForObject(
                "SELECT to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') "
                        + "FROM exhibitions WHERE id = ?",
                String.class,
                publishedExhibitionId
        ));
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT published_at IS NULL FROM exhibitions WHERE id = ?",
                Boolean.class,
                draftExhibitionId
        ));
    }

    private long insertLegacyExhibition(JdbcTemplate jdbcTemplate, String status, String updatedAt) {
        return jdbcTemplate.queryForObject(
                """
                        INSERT INTO exhibitions (title, status, created_at, updated_at)
                        VALUES (?, ?, ?::timestamptz, ?::timestamptz)
                        RETURNING id
                        """,
                Long.class,
                "Legacy " + status,
                status,
                updatedAt,
                updatedAt
        );
    }
}
