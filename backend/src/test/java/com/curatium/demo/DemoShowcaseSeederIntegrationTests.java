package com.curatium.demo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.curatium.artwork.application.ArtworkImportService;
import com.curatium.exhibition.domain.Exhibition;
import com.curatium.exhibition.domain.ExhibitionStatus;
import com.curatium.exhibition.persistence.ExhibitionRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"local", "demo"})
@Testcontainers
class DemoShowcaseSeederIntegrationTests {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private DemoShowcaseSeeder seeder;

    @Autowired
    private ExhibitionRepository exhibitionRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    @MockitoSpyBean
    private ArtworkImportService artworkImportService;

    @Test
    void seedsAndRestoresOnlyItsOwnedShowcaseWithoutCallingTheMuseumProvider() throws Exception {
        Exhibition ownedExhibition = ownedExhibition();
        long ownedExhibitionId = ownedExhibition.getId();
        long ownedArtworkId = ownedExhibition.getItems().get(1).getArtwork().getId();
        long reusedArtworkId = ownedExhibition.getItems().getFirst().getArtwork().getId();

        assertCompleteShowcase(ownedExhibition);
        assertEquals(1, count("SELECT count(*) FROM demo_showcase_seeds"));
        assertEquals(4, count("SELECT count(*) FROM demo_showcase_seed_artworks"));

        long nonDemoExhibitionId = jdbcTemplate.queryForObject("""
                INSERT INTO exhibitions (title, summary, introduction, status)
                VALUES (?, 'Curator-owned summary', 'Curator-owned introduction', 'DRAFT')
                RETURNING id
                """, Long.class, DemoShowcaseSeeder.EXHIBITION_TITLE);

        jdbcTemplate.update("UPDATE artworks SET title = 'Changed owned snapshot' WHERE id = ?", ownedArtworkId);
        seeder.seed();

        assertEquals("Landscape", jdbcTemplate.queryForObject(
                "SELECT title FROM artworks WHERE id = ?", String.class, ownedArtworkId
        ));
        assertUnchangedNonDemoExhibition(nonDemoExhibitionId);
        assertEquals(1, count("SELECT count(*) FROM demo_showcase_seeds"));
        assertEquals(4, count("SELECT count(*) FROM demo_showcase_seed_artworks"));

        jdbcTemplate.update("DELETE FROM exhibition_items WHERE exhibition_id = ?", ownedExhibitionId);
        jdbcTemplate.update("""
                UPDATE exhibitions
                SET summary = 'Partial state', status = 'DRAFT', cover_artwork_id = NULL, published_at = NULL
                WHERE id = ?
                """, ownedExhibitionId);
        seeder.seed();

        assertCompleteShowcase(ownedExhibition());
        assertUnchangedNonDemoExhibition(nonDemoExhibitionId);

        jdbcTemplate.update(
                "DELETE FROM demo_showcase_seed_artworks WHERE artwork_id = ?",
                reusedArtworkId
        );
        jdbcTemplate.update("UPDATE artworks SET title = 'Pre-existing local snapshot' WHERE id = ?", reusedArtworkId);
        seeder.seed();

        assertEquals("Pre-existing local snapshot", jdbcTemplate.queryForObject(
                "SELECT title FROM artworks WHERE id = ?", String.class, reusedArtworkId
        ));
        assertEquals(3, count("SELECT count(*) FROM demo_showcase_seed_artworks"));
        assertEquals(1, count("SELECT count(*) FROM demo_showcase_seeds"));
        assertEquals(1, count("SELECT count(*) FROM exhibitions WHERE id = %d".formatted(ownedExhibitionId)));
        assertEquals(4, count("SELECT count(*) FROM exhibition_items WHERE exhibition_id = %d".formatted(ownedExhibitionId)));
        assertUnchangedNonDemoExhibition(nonDemoExhibitionId);

        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", ownedExhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[0].curatorialNote").isNotEmpty());
        mockMvc.perform(get("/api/public/exhibitions/{exhibitionId}", ownedExhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[3].position").value(4));

        verifyNoInteractions(artworkImportService);
    }

    private Exhibition ownedExhibition() {
        return exhibitionRepository.findAllByStatusOrderByUpdatedAtDesc(ExhibitionStatus.PUBLISHED)
                .stream()
                .filter(candidate -> DemoShowcaseSeeder.EXHIBITION_TITLE.equals(candidate.getTitle()))
                .filter(candidate -> jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM demo_showcase_seeds WHERE exhibition_id = ?",
                        Integer.class,
                        candidate.getId()
                ) == 1)
                .findFirst()
                .orElseThrow();
    }

    private void assertCompleteShowcase(Exhibition exhibition) {
        assertEquals(4, exhibition.getItems().size());
        assertEquals(List.of(1, 2, 3, 4), exhibition.getItems().stream().map(item -> item.getPosition()).toList());
        assertNotNull(exhibition.getCoverArtwork());
        assertEquals("80607", exhibition.getCoverArtwork().getExternalId());
        assertNotNull(exhibition.getPublishedAt());
        assertEquals("Self-Portrait", exhibition.getItems().getFirst().getArtwork().getTitle());
        assertEquals("Landscape (The Lock)", exhibition.getItems().get(2).getArtwork().getTitle());
        assertTrue(exhibition.getItems().stream().allMatch(item -> item.getArtwork().isPublicDomain()));
        assertTrue(exhibition.getItems().stream().allMatch(item -> item.getArtwork().getImageUrl().contains("/iiif/2/")));
    }

    private void assertUnchangedNonDemoExhibition(long exhibitionId) {
        assertEquals("DRAFT", jdbcTemplate.queryForObject(
                "SELECT status FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertEquals("Curator-owned summary", jdbcTemplate.queryForObject(
                "SELECT summary FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertEquals("Curator-owned introduction", jdbcTemplate.queryForObject(
                "SELECT introduction FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertEquals(0, count("SELECT count(*) FROM exhibition_items WHERE exhibition_id = %d".formatted(exhibitionId)));
    }

    private int count(String sql) {
        return jdbcTemplate.queryForObject(sql, Integer.class);
    }
}
