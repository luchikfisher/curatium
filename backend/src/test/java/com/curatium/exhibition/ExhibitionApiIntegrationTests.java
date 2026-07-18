package com.curatium.exhibition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ExhibitionApiIntegrationTests {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE exhibition_items, exhibitions, artworks RESTART IDENTITY CASCADE");
    }

    @Test
    void supportsDraftExhibitionMetadataWorkflow() throws Exception {
        JsonNode createdExhibition = createExhibition("  City at Night  ", "  A study of the city.  ", "  Introductory text.  ");
        long exhibitionId = createdExhibition.get("id").asLong();

        mockMvc.perform(get("/api/exhibitions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(exhibitionId))
                .andExpect(jsonPath("$[0].title").value("City at Night"))
                .andExpect(jsonPath("$[0].summary").value("A study of the city."))
                .andExpect(jsonPath("$[0].status").value("DRAFT"))
                .andExpect(jsonPath("$[0].coverImageUrl").doesNotExist())
                .andExpect(jsonPath("$[0].artworkCount").value(0));

        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.introduction").value("Introductory text."))
                .andExpect(jsonPath("$.items").isEmpty());

        String updateBody = """
                {
                  "title": "Updated exhibition",
                  "summary": "",
                  "introduction": "Updated introduction"
                }
                """;
        MvcResult updateResult = mockMvc.perform(put("/api/exhibitions/{exhibitionId}", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated exhibition"))
                .andExpect(jsonPath("$.summary").doesNotExist())
                .andExpect(jsonPath("$.introduction").value("Updated introduction"))
                .andReturn();

        JsonNode updatedExhibition = readResponse(updateResult);
        assertNotEquals(createdExhibition.get("updatedAt").asString(), updatedExhibition.get("updatedAt").asString());

        MvcResult persistedResult = mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(updatedExhibition.get("updatedAt").asString(), readResponse(persistedResult).get("updatedAt").asString());

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_NOT_FOUND"));
    }

    @Test
    void returnsStructuredFieldErrorsForInvalidRequests() throws Exception {
        mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \",\"summary\":\"text\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));

        String tooLongTitle = "x".repeat(151);
        mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"%s\"}".formatted(tooLongTitle)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));
    }

    @Test
    void rejectsUpdatesAndDeletionForPublishedExhibitions() throws Exception {
        long exhibitionId = createExhibition("Published exhibition", null, null).get("id").asLong();
        jdbcTemplate.update("UPDATE exhibitions SET status = 'PUBLISHED' WHERE id = ?", exhibitionId);

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Changed\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
    }

    @Test
    void preservesFrameworkRequestStatuses() throws Exception {
        mockMvc.perform(get("/api/not-implemented"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));

        mockMvc.perform(get("/api/exhibitions/not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("exhibitionId"));

        mockMvc.perform(patch("/api/exhibitions"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
                .andExpect(header().exists(HttpHeaders.ALLOW));

        mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("not json"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));

        mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void allowsConfiguredFrontendOriginForPreflightRequests() throws Exception {
        mockMvc.perform(options("/api/exhibitions")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));
    }

    @Test
    void databaseEnforcesArtworkAndExhibitionItemConstraints() throws Exception {
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update(
                "INSERT INTO exhibitions (title, status) VALUES ('   ', 'DRAFT')"
        ));

        long exhibitionId = insertExhibition("Constraint exhibition");
        long firstArtworkId = insertArtwork("27992");
        long secondArtworkId = insertArtwork("27993");
        insertExhibitionItem(exhibitionId, firstArtworkId, 1);

        assertThrows(DataIntegrityViolationException.class, () -> insertArtwork("27992"));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertExhibitionItem(exhibitionId, firstArtworkId, 2));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertExhibitionItem(exhibitionId, secondArtworkId, 1));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertExhibitionItem(exhibitionId, secondArtworkId, 0));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertExhibitionItem(exhibitionId + 1, secondArtworkId, 2));

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isNoContent());

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
        ));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM artworks WHERE id = ?", Integer.class, firstArtworkId
        ));
    }

    private JsonNode createExhibition(String title, String summary, String introduction) throws Exception {
        String body = objectMapper.writeValueAsString(new ExhibitionRequest(title, summary, introduction));
        MvcResult result = mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return readResponse(result);
    }

    private JsonNode readResponse(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private long insertExhibition(String title) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO exhibitions (title, status) VALUES (?, 'DRAFT') RETURNING id",
                Long.class,
                title
        );
    }

    private long insertArtwork(String externalId) {
        return jdbcTemplate.queryForObject(
                """
                        INSERT INTO artworks (
                            source, external_id, title, thumbnail_url, image_url, public_domain
                        ) VALUES ('ART_INSTITUTE_OF_CHICAGO', ?, 'Example artwork',
                            'https://example.test/thumb.jpg', 'https://example.test/image.jpg', true)
                        RETURNING id
                        """,
                Long.class,
                externalId
        );
    }

    private void insertExhibitionItem(long exhibitionId, long artworkId, int position) {
        jdbcTemplate.update(
                "INSERT INTO exhibition_items (exhibition_id, artwork_id, position) VALUES (?, ?, ?)",
                exhibitionId,
                artworkId,
                position
        );
    }

    private record ExhibitionRequest(String title, String summary, String introduction) {
    }
}
