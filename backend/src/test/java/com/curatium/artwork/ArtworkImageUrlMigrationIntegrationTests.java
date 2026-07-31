package com.curatium.artwork;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class ArtworkImageUrlMigrationIntegrationTests {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Test
    void localizesRecognizedLegacyArtInstituteUrlsAndUsesTheUnavailableSentinelOtherwise() {
        migrate("6");
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        insertArtwork(
                jdbcTemplate,
                "recognized",
                "https://www.artic.edu/iiif/2/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/full/400,/0/default.jpg",
                "https://www.artic.edu/iiif/2/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/full/843,/0/default.jpg"
        );
        insertArtwork(
                jdbcTemplate,
                "legacy-200",
                "https://www.artic.edu/iiif/2/3ccdfe37-97e5-4849-2ee9-aef8e7e27595/full/200,/0/default.jpg",
                "https://example.test/image.jpg"
        );
        insertArtwork(
                jdbcTemplate,
                "already-local",
                "/api/artwork-images/art-institute/ff3b5c8a-5b14-5c35-8775-3d021e92a381/thumbnail",
                "/api/artwork-images/art-institute/ff3b5c8a-5b14-5c35-8775-3d021e92a381/display"
        );

        migrate(null);

        assertUrls(
                jdbcTemplate,
                "recognized",
                "/api/artwork-images/art-institute/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/thumbnail",
                "/api/artwork-images/art-institute/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/display"
        );
        assertUrls(
                jdbcTemplate,
                "legacy-200",
                "/api/artwork-images/art-institute/3ccdfe37-97e5-4849-2ee9-aef8e7e27595/thumbnail",
                "/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display"
        );
        assertUrls(
                jdbcTemplate,
                "already-local",
                "/api/artwork-images/art-institute/ff3b5c8a-5b14-5c35-8775-3d021e92a381/thumbnail",
                "/api/artwork-images/art-institute/ff3b5c8a-5b14-5c35-8775-3d021e92a381/display"
        );
    }

    private void migrate(String target) {
        FluentConfiguration configuration = Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        configuration.load().migrate();
    }

    private JdbcTemplate jdbcTemplate() {
        return new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()
        ));
    }

    private void insertArtwork(JdbcTemplate jdbcTemplate, String externalId, String thumbnailUrl, String imageUrl) {
        jdbcTemplate.update("""
                INSERT INTO artworks (source, external_id, title, thumbnail_url, image_url, public_domain)
                VALUES ('ART_INSTITUTE_OF_CHICAGO', ?, ?, ?, ?, true)
                """, externalId, "Legacy " + externalId, thumbnailUrl, imageUrl);
    }

    private void assertUrls(JdbcTemplate jdbcTemplate, String externalId, String thumbnailUrl, String imageUrl) {
        assertEquals(thumbnailUrl, jdbcTemplate.queryForObject(
                "SELECT thumbnail_url FROM artworks WHERE external_id = ?", String.class, externalId
        ));
        assertEquals(imageUrl, jdbcTemplate.queryForObject(
                "SELECT image_url FROM artworks WHERE external_id = ?", String.class, externalId
        ));
    }
}
