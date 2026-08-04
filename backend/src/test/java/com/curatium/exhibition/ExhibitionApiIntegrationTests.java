package com.curatium.exhibition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.curatium.exhibition.domain.Exhibition;
import com.curatium.exhibition.persistence.ExhibitionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
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

    private static final AtomicInteger DETAIL_STATUS = new AtomicInteger();
    private static final AtomicInteger DETAIL_REQUESTS = new AtomicInteger();
    private static final AtomicReference<CountDownLatch> DETAIL_REQUEST_READY = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> DETAIL_RESPONSE_GATE = new AtomicReference<>();
    private static final ExecutorService MUSEUM_SERVER_EXECUTOR = Executors.newFixedThreadPool(2);
    private static final HttpServer MUSEUM_SERVER = startMuseumServer();

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @MockitoSpyBean
    private ExhibitionRepository exhibitionRepository;

    @DynamicPropertySource
    static void museumProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "curatium.art-institute.base-url",
                () -> "http://localhost:" + MUSEUM_SERVER.getAddress().getPort()
        );
    }

    @AfterAll
    static void stopMuseumServer() {
        MUSEUM_SERVER.stop(0);
        MUSEUM_SERVER_EXECUTOR.shutdownNow();
    }

    @BeforeEach
    void clearDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE exhibition_items, exhibitions, artworks RESTART IDENTITY CASCADE");
        DETAIL_STATUS.set(200);
        DETAIL_REQUESTS.set(0);
        DETAIL_REQUEST_READY.set(null);
        DETAIL_RESPONSE_GATE.set(null);
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
        MvcResult blankTitle = mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \",\"summary\":\"text\"}"))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertValidationError(blankTitle, "title", "Title is required.");

        String tooLongTitle = "x".repeat(151);
        MvcResult titleTooLong = mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"%s\"}".formatted(tooLongTitle)))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertValidationError(titleTooLong, "title", "Title must be at most 150 characters.");

        MvcResult summaryTooLong = mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Valid title\",\"summary\":\"%s\"}".formatted("x".repeat(301))))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertValidationError(summaryTooLong, "summary", "Summary must be at most 300 characters.");

        MvcResult introductionTooLong = mockMvc.perform(post("/api/exhibitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Valid title\",\"introduction\":\"%s\"}".formatted("x".repeat(5001))))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertValidationError(introductionTooLong, "introduction", "Introduction must be at most 5,000 characters.");
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

    @Test
    void addsImportedArtworksToDraftExhibitionsInContinuousOrder() throws Exception {
        long exhibitionId = createExhibition("Artwork sequence", null, null).get("id").asLong();

        mockMvc.perform(addArtworkRequest(exhibitionId, "154235"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.position").value(1))
                .andExpect(jsonPath("$.artwork.externalId").value("154235"))
                .andExpect(jsonPath("$.artwork.title").value("Artwork 154235"));

        mockMvc.perform(addArtworkRequest(exhibitionId, "154236"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.position").value(2))
                .andExpect(jsonPath("$.artwork.externalId").value("154236"));

        DETAIL_STATUS.set(503);
        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].position").value(1))
                .andExpect(jsonPath("$.items[0].artwork.title").value("Artwork 154235"))
                .andExpect(jsonPath("$.items[1].position").value(2))
                .andExpect(jsonPath("$.items[1].artwork.title").value("Artwork 154236"));

        assertEquals(2, DETAIL_REQUESTS.get());
    }

    @Test
    void reusesLocalArtworkSnapshotsWithoutCallingTheProvider() throws Exception {
        long exhibitionId = createExhibition("Local snapshot", null, null).get("id").asLong();
        insertArtwork("27992");
        DETAIL_STATUS.set(503);

        mockMvc.perform(addArtworkRequest(exhibitionId, "27992"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.position").value(1))
                .andExpect(jsonPath("$.artwork.externalId").value("27992"));

        assertEquals(0, DETAIL_REQUESTS.get());
    }

    @Test
    void rejectsMissingPublishedAndDuplicateExhibitionItemAdditions() throws Exception {
        mockMvc.perform(addArtworkRequest(9999, "154235"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_NOT_FOUND"));

        long publishedExhibitionId = createExhibition("Published exhibition", null, null).get("id").asLong();
        jdbcTemplate.update("UPDATE exhibitions SET status = 'PUBLISHED' WHERE id = ?", publishedExhibitionId);
        mockMvc.perform(addArtworkRequest(publishedExhibitionId, "154235"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));

        long exhibitionId = createExhibition("Duplicate artwork", null, null).get("id").asLong();
        mockMvc.perform(addArtworkRequest(exhibitionId, "154235"))
                .andExpect(status().isCreated());
        DETAIL_STATUS.set(503);
        mockMvc.perform(addArtworkRequest(exhibitionId, "154235"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_EXHIBITION_ARTWORK"));
    }

    @Test
    void rejectsAnEleventhArtwork() throws Exception {
        long exhibitionId = insertExhibition("At capacity");
        for (int position = 1; position <= 10; position++) {
            long artworkId = insertArtwork("capacity-" + position);
            insertExhibitionItem(exhibitionId, artworkId, position);
        }
        insertArtwork("overflow");

        mockMvc.perform(addArtworkRequest(exhibitionId, "overflow"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ARTWORK_LIMIT_REACHED"));

        assertEquals(10, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
        ));
    }

    @Test
    void updatesAndClearsCuratorialNotes() throws Exception {
        long exhibitionId = insertExhibition("Notes");
        long itemId = insertExhibitionItem(exhibitionId, insertArtwork("note-artwork"), 1);

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"curatorialNote\":\"  A closer look at the city.  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(itemId))
                .andExpect(jsonPath("$.curatorialNote").value("A closer look at the city."));
        assertEquals("A closer look at the city.", jdbcTemplate.queryForObject(
                "SELECT curatorial_note FROM exhibition_items WHERE id = ?", String.class, itemId
        ));

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"curatorialNote\":\"   \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.curatorialNote").doesNotExist());

        assertNull(jdbcTemplate.queryForObject(
                "SELECT curatorial_note FROM exhibition_items WHERE id = ?", String.class, itemId
        ));
    }

    @Test
    void validatesCuratorialNoteLength() throws Exception {
        long exhibitionId = insertExhibition("Note validation");
        long itemId = insertExhibitionItem(exhibitionId, insertArtwork("long-note-artwork"), 1);

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"curatorialNote\":\"%s\"}".formatted("x".repeat(2001))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("curatorialNote"));
    }

    @Test
    void removesMiddleItemNormalizesPositionsClearsCoverAndPreservesArtwork() throws Exception {
        long exhibitionId = insertExhibition("Removal");
        long firstArtworkId = insertArtwork("remove-first");
        long coverArtworkId = insertArtwork("remove-cover");
        long lastArtworkId = insertArtwork("remove-last");
        insertExhibitionItem(exhibitionId, firstArtworkId, 1);
        long coverItemId = insertExhibitionItem(exhibitionId, coverArtworkId, 2);
        insertExhibitionItem(exhibitionId, lastArtworkId, 3);
        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", coverArtworkId, exhibitionId);

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, coverItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").doesNotExist())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].position").value(1))
                .andExpect(jsonPath("$.items[0].artwork.id").value(firstArtworkId))
                .andExpect(jsonPath("$.items[1].position").value(2))
                .andExpect(jsonPath("$.items[1].artwork.id").value(lastArtworkId));

        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").doesNotExist())
                .andExpect(jsonPath("$.items[0].position").value(1))
                .andExpect(jsonPath("$.items[0].artwork.id").value(firstArtworkId))
                .andExpect(jsonPath("$.items[1].position").value(2))
                .andExpect(jsonPath("$.items[1].artwork.id").value(lastArtworkId));

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM artworks WHERE id = ?", Integer.class, coverArtworkId
        ));
        assertContinuousPositions(exhibitionId);
    }

    @Test
    void removesNonCoverItemPreservesCoverAndReturnsAuthoritativeOrder() throws Exception {
        long exhibitionId = insertExhibition("Non-cover removal");
        long coverArtworkId = insertArtwork("retained-cover");
        long removedArtworkId = insertArtwork("removed-non-cover");
        long lastArtworkId = insertArtwork("retained-last");
        insertExhibitionItem(exhibitionId, coverArtworkId, 1);
        long removedItemId = insertExhibitionItem(exhibitionId, removedArtworkId, 2);
        insertExhibitionItem(exhibitionId, lastArtworkId, 3);
        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", coverArtworkId, exhibitionId);

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, removedItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").value(coverArtworkId))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].position").value(1))
                .andExpect(jsonPath("$.items[0].artwork.id").value(coverArtworkId))
                .andExpect(jsonPath("$.items[1].position").value(2))
                .andExpect(jsonPath("$.items[1].artwork.id").value(lastArtworkId));

        assertContinuousPositions(exhibitionId);
        assertEquals(coverArtworkId, jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));
    }

    @Test
    void serializesMetadataUpdateAndCoverItemRemoval() throws Exception {
        long exhibitionId = insertExhibition("Metadata and cover");
        long coverArtworkId = insertArtwork("concurrent-cover");
        long coverItemId = insertExhibitionItem(exhibitionId, coverArtworkId, 1);
        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", coverArtworkId, exhibitionId);

        AtomicInteger lockLookups = new AtomicInteger();
        CountDownLatch metadataLockAcquired = new CountDownLatch(1);
        CountDownLatch removalLockLookupStarted = new CountDownLatch(1);
        CountDownLatch releaseMetadataUpdate = new CountDownLatch(1);
        doAnswer(invocation -> {
            int lookupNumber = lockLookups.incrementAndGet();
            if (lookupNumber == 2) {
                removalLockLookupStarted.countDown();
            }

            Optional<Exhibition> exhibition = entityManager.createQuery(
                            "select exhibition from Exhibition exhibition where exhibition.id = :exhibitionId",
                            Exhibition.class
                    )
                    .setParameter("exhibitionId", exhibitionId)
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultStream()
                    .findFirst();
            if (lookupNumber == 1) {
                metadataLockAcquired.countDown();
                releaseMetadataUpdate.await(5, TimeUnit.SECONDS);
            }
            return exhibition;
        }).when(exhibitionRepository).findByIdForUpdate(exhibitionId);

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> metadataUpdate = callers.submit(() -> mockMvc.perform(
                            put("/api/exhibitions/{exhibitionId}", exhibitionId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"title\":\"Updated metadata\"}")
                    )
                    .andReturn());
            assertTrue(metadataLockAcquired.await(5, TimeUnit.SECONDS));

            Future<MvcResult> removeCoverItem = callers.submit(() -> mockMvc.perform(
                            delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, coverItemId)
                    )
                    .andReturn());
            assertTrue(removalLockLookupStarted.await(5, TimeUnit.SECONDS));

            releaseMetadataUpdate.countDown();

            assertEquals(200, metadataUpdate.get(10, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(200, removeCoverItem.get(10, TimeUnit.SECONDS).getResponse().getStatus());
        } finally {
            releaseMetadataUpdate.countDown();
            callers.shutdownNow();
            reset(exhibitionRepository);
        }

        assertEquals("Updated metadata", jdbcTemplate.queryForObject(
                "SELECT title FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertNull(jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE id = ?", Integer.class, coverItemId
        ));
    }

    @Test
    void movesItemsUpAndDownWithContinuousPositions() throws Exception {
        long exhibitionId = insertExhibition("Moves");
        long firstItemId = insertExhibitionItem(exhibitionId, insertArtwork("move-first"), 1);
        long secondItemId = insertExhibitionItem(exhibitionId, insertArtwork("move-second"), 2);
        long thirdItemId = insertExhibitionItem(exhibitionId, insertArtwork("move-third"), 3);

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-up", exhibitionId, secondItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(secondItemId))
                .andExpect(jsonPath("$[0].position").value(1))
                .andExpect(jsonPath("$[1].id").value(firstItemId))
                .andExpect(jsonPath("$[1].position").value(2));
        assertContinuousPositions(exhibitionId);
        assertItemIdsInOrder(exhibitionId, secondItemId, firstItemId, thirdItemId);

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-down", exhibitionId, secondItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(firstItemId))
                .andExpect(jsonPath("$[1].id").value(secondItemId))
                .andExpect(jsonPath("$[2].id").value(thirdItemId));
        assertContinuousPositions(exhibitionId);
        assertItemIdsInOrder(exhibitionId, firstItemId, secondItemId, thirdItemId);
    }

    @Test
    void keepsOrderAtMoveBoundaries() throws Exception {
        long exhibitionId = insertExhibition("Move boundaries");
        long firstItemId = insertExhibitionItem(exhibitionId, insertArtwork("boundary-first"), 1);
        long lastItemId = insertExhibitionItem(exhibitionId, insertArtwork("boundary-last"), 2);

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-up", exhibitionId, firstItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(firstItemId))
                .andExpect(jsonPath("$[1].id").value(lastItemId));
        assertItemIdsInOrder(exhibitionId, firstItemId, lastItemId);

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-down", exhibitionId, lastItemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(firstItemId))
                .andExpect(jsonPath("$[1].id").value(lastItemId));
        assertContinuousPositions(exhibitionId);
        assertItemIdsInOrder(exhibitionId, firstItemId, lastItemId);
    }

    @Test
    void rejectsDraftOnlyCurationAndReportsMissingItems() throws Exception {
        long exhibitionId = insertExhibition("Published curation");
        long itemId = insertExhibitionItem(exhibitionId, insertArtwork("published-curation"), 1);
        jdbcTemplate.update("UPDATE exhibitions SET status = 'PUBLISHED' WHERE id = ?", exhibitionId);

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"curatorialNote\":\"No changes\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-up", exhibitionId, itemId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-down", exhibitionId, itemId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", 9999, itemId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_NOT_FOUND"));

        jdbcTemplate.update("UPDATE exhibitions SET status = 'DRAFT' WHERE id = ?", exhibitionId);
        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, 9999))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ITEM_NOT_FOUND"));
    }

    @Test
    void rejectsItemMutationsThroughAnotherExhibitionsPath() throws Exception {
        long firstExhibitionId = insertExhibition("First exhibition");
        long firstItemId = insertExhibitionItem(firstExhibitionId, insertArtwork("first-artwork"), 1);
        jdbcTemplate.update(
                "UPDATE exhibition_items SET curatorial_note = ? WHERE id = ?",
                "First note",
                firstItemId
        );
        long secondExhibitionId = insertExhibition("Second exhibition");
        long secondItemId = insertExhibitionItem(secondExhibitionId, insertArtwork("second-artwork"), 1);
        jdbcTemplate.update(
                "UPDATE exhibition_items SET curatorial_note = ? WHERE id = ?",
                "Second note",
                secondItemId
        );

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/items/{itemId}", secondExhibitionId, firstItemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"curatorialNote\":\"Changed\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ITEM_NOT_FOUND"));
        assertExhibitionItemState(firstExhibitionId, List.of(firstItemId), List.of("First note"));
        assertExhibitionItemState(secondExhibitionId, List.of(secondItemId), List.of("Second note"));

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/items/{itemId}", secondExhibitionId, firstItemId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ITEM_NOT_FOUND"));
        assertExhibitionItemState(firstExhibitionId, List.of(firstItemId), List.of("First note"));
        assertExhibitionItemState(secondExhibitionId, List.of(secondItemId), List.of("Second note"));

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-up", secondExhibitionId, firstItemId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ITEM_NOT_FOUND"));
        assertExhibitionItemState(firstExhibitionId, List.of(firstItemId), List.of("First note"));
        assertExhibitionItemState(secondExhibitionId, List.of(secondItemId), List.of("Second note"));

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/items/{itemId}/move-down", secondExhibitionId, firstItemId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_ITEM_NOT_FOUND"));
        assertExhibitionItemState(firstExhibitionId, List.of(firstItemId), List.of("First note"));
        assertExhibitionItemState(secondExhibitionId, List.of(secondItemId), List.of("Second note"));
    }

    @Test
    void rollsBackNewArtworkSnapshotWhenCapacityIsReachedBeforeTheLockedCheck() throws Exception {
        long exhibitionId = insertExhibition("Capacity changes while importing");
        for (int position = 1; position <= 9; position++) {
            long artworkId = insertArtwork("capacity-race-" + position);
            insertExhibitionItem(exhibitionId, artworkId, position);
        }
        insertArtwork("capacity-race-local");

        CountDownLatch providerRequestReady = new CountDownLatch(1);
        CountDownLatch releaseProviderResponse = new CountDownLatch(1);
        DETAIL_REQUEST_READY.set(providerRequestReady);
        DETAIL_RESPONSE_GATE.set(releaseProviderResponse);

        ExecutorService callers = Executors.newSingleThreadExecutor();
        try {
            Future<Integer> remoteAdd = callers.submit(() -> addArtworkStatus(exhibitionId, "154237"));
            assertTrue(providerRequestReady.await(5, TimeUnit.SECONDS));

            assertEquals(201, addArtworkStatus(exhibitionId, "capacity-race-local"));
            releaseProviderResponse.countDown();

            assertEquals(409, remoteAdd.get(10, TimeUnit.SECONDS));
            assertEquals(10, jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
            ));
            assertEquals(0, jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM artworks WHERE source = 'ART_INSTITUTE_OF_CHICAGO' AND external_id = '154237'",
                    Integer.class
            ));
        } finally {
            releaseProviderResponse.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    void serializesConcurrentAddsNearTheArtworkLimit() throws Exception {
        long exhibitionId = insertExhibition("Concurrent capacity");
        for (int position = 1; position <= 9; position++) {
            long artworkId = insertArtwork("concurrent-" + position);
            insertExhibitionItem(exhibitionId, artworkId, position);
        }
        insertArtwork("concurrent-10");
        insertArtwork("concurrent-11");

        ExecutorService callers = Executors.newFixedThreadPool(2);
        CountDownLatch workersReady = new CountDownLatch(2);
        CountDownLatch startGate = new CountDownLatch(1);
        try {
            Future<Integer> first = callers.submit(() -> {
                workersReady.countDown();
                startGate.await();
                return addArtworkStatus(exhibitionId, "concurrent-10");
            });
            Future<Integer> second = callers.submit(() -> {
                workersReady.countDown();
                startGate.await();
                return addArtworkStatus(exhibitionId, "concurrent-11");
            });
            assertTrue(workersReady.await(5, TimeUnit.SECONDS));
            startGate.countDown();

            List<Integer> statuses = List.of(
                    first.get(10, TimeUnit.SECONDS),
                    second.get(10, TimeUnit.SECONDS)
            );
            assertTrue(statuses.contains(201));
            assertTrue(statuses.contains(409));
            assertEquals(10, jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
            ));
            assertEquals(10, jdbcTemplate.queryForObject(
                    "SELECT max(position) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
            ));
        } finally {
            startGate.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    void serializesConcurrentAddsOfTheSameArtwork() throws Exception {
        long exhibitionId = insertExhibition("Concurrent duplicate");
        insertArtwork("concurrent-duplicate");

        ExecutorService callers = Executors.newFixedThreadPool(2);
        CountDownLatch workersReady = new CountDownLatch(2);
        CountDownLatch startGate = new CountDownLatch(1);
        try {
            Future<Integer> first = callers.submit(() -> {
                workersReady.countDown();
                startGate.await();
                return addArtworkStatus(exhibitionId, "concurrent-duplicate");
            });
            Future<Integer> second = callers.submit(() -> {
                workersReady.countDown();
                startGate.await();
                return addArtworkStatus(exhibitionId, "concurrent-duplicate");
            });
            assertTrue(workersReady.await(5, TimeUnit.SECONDS));
            startGate.countDown();

            List<Integer> statuses = List.of(
                    first.get(10, TimeUnit.SECONDS),
                    second.get(10, TimeUnit.SECONDS)
            );
            assertTrue(statuses.contains(201));
            assertTrue(statuses.contains(409));
            assertEquals(1, jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
            ));
        } finally {
            startGate.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    void selectsReplacesAndClearsDraftCovers() throws Exception {
        long exhibitionId = insertExhibition("Cover selection");
        long firstArtworkId = insertArtwork("cover-first");
        long secondArtworkId = insertArtwork("cover-second");
        long secondExhibitionId = insertExhibition("Other exhibition");
        long otherExhibitionArtworkId = insertArtwork("cover-other-exhibition");
        long firstItemId = insertExhibitionItem(exhibitionId, firstArtworkId, 1);
        long secondItemId = insertExhibitionItem(exhibitionId, secondArtworkId, 2);
        long otherExhibitionItemId = insertExhibitionItem(secondExhibitionId, otherExhibitionArtworkId, 1);

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"artworkId\":%d}".formatted(firstArtworkId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").value(firstArtworkId));
        assertEquals(firstArtworkId, jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"artworkId\":%d}".formatted(secondArtworkId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").value(secondArtworkId));

        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").value(secondArtworkId));

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"artworkId\":%d}".formatted(otherExhibitionArtworkId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_COVER_ARTWORK"));
        assertEquals(secondArtworkId, jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));
        assertNull(jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, secondExhibitionId
        ));
        assertItemIdsInOrder(exhibitionId, firstItemId, secondItemId);
        assertEquals(otherExhibitionItemId, jdbcTemplate.queryForObject(
                "SELECT id FROM exhibition_items WHERE exhibition_id = ?", Long.class, secondExhibitionId
        ));

        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/cover", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverArtworkId").doesNotExist());
        assertNull(jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));

        jdbcTemplate.update("UPDATE exhibitions SET status = 'PUBLISHED' WHERE id = ?", exhibitionId);
        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"artworkId\":%d}".formatted(firstArtworkId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
        mockMvc.perform(delete("/api/exhibitions/{exhibitionId}/cover", exhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISHED_EXHIBITION_READ_ONLY"));
    }

    @Test
    void validatesCoverRequest() throws Exception {
        long exhibitionId = insertExhibition("Cover validation");

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("artworkId"));
    }

    @Test
    void publishesOnlyWhenPublicationPrerequisitesAreMet() throws Exception {
        long emptyExhibitionId = insertExhibition("Empty publication");
        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/publish", emptyExhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_PUBLICATION_STATE"));
        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", emptyExhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.publishedAt").isEmpty());

        long noCoverExhibitionId = insertExhibition("No cover publication");
        long noCoverArtworkId = insertArtwork("no-cover");
        insertExhibitionItem(noCoverExhibitionId, noCoverArtworkId, 1);
        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/publish", noCoverExhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_PUBLICATION_STATE"));

        long invalidCoverExhibitionId = insertExhibition("Invalid cover publication");
        long memberArtworkId = insertArtwork("publication-member");
        long unrelatedArtworkId = insertArtwork("publication-unrelated");
        insertExhibitionItem(invalidCoverExhibitionId, memberArtworkId, 1);
        jdbcTemplate.update(
                "UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?",
                unrelatedArtworkId,
                invalidCoverExhibitionId
        );
        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/publish", invalidCoverExhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_PUBLICATION_STATE"));

        long exhibitionId = insertExhibition("Ready to publish");
        long artworkId = insertArtwork("publish-cover");
        insertExhibitionItem(exhibitionId, artworkId, 1);
        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", artworkId, exhibitionId);
        String previousUpdatedAt = jdbcTemplate.queryForObject(
                "SELECT updated_at::text FROM exhibitions WHERE id = ?", String.class, exhibitionId
        );

        JsonNode publishedExhibition = readResponse(mockMvc.perform(
                        post("/api/exhibitions/{exhibitionId}/publish", exhibitionId)
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.publishedAt").isNotEmpty())
                .andExpect(jsonPath("$.coverArtworkId").value(artworkId))
                .andReturn());
        String publishedAt = publishedExhibition.get("publishedAt").asString();
        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT status FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertNotEquals(previousUpdatedAt, jdbcTemplate.queryForObject(
                "SELECT updated_at::text FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/publish", exhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_PUBLICATION_STATE"));
        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.publishedAt").value(publishedAt));
    }

    @Test
    void unpublishesPreservesStateAndRestoresEditing() throws Exception {
        JsonNode createdExhibition = createExhibition(
                "Return to draft",
                "A preserved summary",
                "A preserved introduction"
        );
        long exhibitionId = createdExhibition.get("id").asLong();
        long firstArtworkId = insertArtwork("unpublish-first");
        long secondArtworkId = insertArtwork("unpublish-second");
        long firstItemId = insertExhibitionItem(exhibitionId, firstArtworkId, 1);
        long secondItemId = insertExhibitionItem(exhibitionId, secondArtworkId, 2);
        jdbcTemplate.update(
                "UPDATE exhibition_items SET curatorial_note = ? WHERE id = ?", "First note", firstItemId
        );
        jdbcTemplate.update(
                "UPDATE exhibition_items SET curatorial_note = ? WHERE id = ?", "Second note", secondItemId
        );
        mockMvc.perform(put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"artworkId\":%d}".formatted(secondArtworkId)))
                .andExpect(status().isOk());
        JsonNode publishedExhibition = readResponse(mockMvc.perform(
                        post("/api/exhibitions/{exhibitionId}/publish", exhibitionId)
                )
                .andExpect(status().isOk())
                .andReturn());
        assertTrue(publishedExhibition.path("publishedAt").isTextual());
        String firstPublishedAt = publishedExhibition.get("publishedAt").asString();

        JsonNode unpublishedExhibition = readResponse(mockMvc.perform(
                        post("/api/exhibitions/{exhibitionId}/unpublish", exhibitionId)
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn());
        assertTrue(unpublishedExhibition.path("publishedAt").isNull());
        assertNull(jdbcTemplate.queryForObject(
                "SELECT published_at::text FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertNotEquals(
                publishedExhibition.get("updatedAt").asString(),
                unpublishedExhibition.get("updatedAt").asString()
        );

        JsonNode persistedExhibition = readResponse(mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals("DRAFT", persistedExhibition.get("status").asString());
        assertEquals("Return to draft", persistedExhibition.get("title").asString());
        assertEquals("A preserved summary", persistedExhibition.get("summary").asString());
        assertEquals("A preserved introduction", persistedExhibition.get("introduction").asString());
        assertEquals(secondArtworkId, persistedExhibition.get("coverArtworkId").asLong());
        assertEquals(unpublishedExhibition.get("updatedAt").asString(), persistedExhibition.get("updatedAt").asString());
        assertItemIdsInOrder(exhibitionId, firstItemId, secondItemId);
        assertExhibitionItemState(
                exhibitionId,
                List.of(firstItemId, secondItemId),
                List.of("First note", "Second note")
        );
        assertEquals(
                List.of("unpublish-first", "unpublish-second"),
                jdbcTemplate.queryForList(
                        "SELECT external_id FROM artworks WHERE id IN (?, ?) ORDER BY id",
                        String.class,
                        firstArtworkId,
                        secondArtworkId
                )
        );
        assertEquals(
                List.of(
                        "/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display",
                        "/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display"
                ),
                jdbcTemplate.queryForList(
                        "SELECT image_url FROM artworks WHERE id IN (?, ?) ORDER BY id",
                        String.class,
                        firstArtworkId,
                        secondArtworkId
                )
        );

        mockMvc.perform(put("/api/exhibitions/{exhibitionId}", exhibitionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"Editable again",
                                  "summary":"A preserved summary",
                                  "introduction":"A preserved introduction"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Editable again"));

        mockMvc.perform(post("/api/exhibitions/{exhibitionId}/unpublish", exhibitionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_PUBLICATION_STATE"));
        mockMvc.perform(get("/api/exhibitions/{exhibitionId}", exhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.publishedAt").isEmpty());

        JsonNode republishedExhibition = readResponse(mockMvc.perform(
                        post("/api/exhibitions/{exhibitionId}/publish", exhibitionId)
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.publishedAt").isNotEmpty())
                .andReturn());
        Instant firstPublicationTime = Instant.parse(firstPublishedAt);
        Instant republishedAt = Instant.parse(republishedExhibition.get("publishedAt").asString());
        assertTrue(republishedAt.isAfter(firstPublicationTime));
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT published_at IS NOT NULL FROM exhibitions WHERE id = ?", Boolean.class, exhibitionId
        ));
    }

    @Test
    void servesOnlyPublishedExhibitionsFromLocalSnapshots() throws Exception {
        long draftExhibitionId = insertExhibition("Draft exhibition");
        long publishedExhibitionId = insertExhibition("Published exhibition");
        long firstArtworkId = insertArtwork("public-first");
        long secondArtworkId = insertArtwork("public-second");
        long firstItemId = insertExhibitionItem(publishedExhibitionId, firstArtworkId, 1);
        long secondItemId = insertExhibitionItem(publishedExhibitionId, secondArtworkId, 2);
        jdbcTemplate.update(
                "UPDATE exhibition_items SET curatorial_note = ? WHERE id = ?", "First public note", firstItemId
        );
        jdbcTemplate.update(
                "UPDATE exhibitions SET summary = ?, introduction = ?, cover_artwork_id = ?, status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE id = ?",
                "Published summary", "Published introduction", secondArtworkId, publishedExhibitionId
        );
        DETAIL_STATUS.set(503);

        JsonNode catalogue = readResponse(mockMvc.perform(get("/api/public/exhibitions"))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1, catalogue.size());
        assertEquals(publishedExhibitionId, catalogue.get(0).get("id").asLong());
        assertFalse(catalogue.toString().contains("\"id\":" + draftExhibitionId));

        mockMvc.perform(get("/api/public/exhibitions/{exhibitionId}", publishedExhibitionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Published exhibition"))
                .andExpect(jsonPath("$.summary").value("Published summary"))
                .andExpect(jsonPath("$.introduction").value("Published introduction"))
                .andExpect(jsonPath("$.publishedAt").isNotEmpty())
                .andExpect(jsonPath("$.coverArtworkId").value(secondArtworkId))
                .andExpect(jsonPath("$.items[0].id").value(firstItemId))
                .andExpect(jsonPath("$.items[0].position").value(1))
                .andExpect(jsonPath("$.items[0].curatorialNote").value("First public note"))
                .andExpect(jsonPath("$.items[0].artwork.title").value("Example artwork"))
                .andExpect(jsonPath("$.items[0].artwork.imageUrl")
                        .value("/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display"))
                .andExpect(jsonPath("$.items[1].id").value(secondItemId));
        assertEquals(0, DETAIL_REQUESTS.get());

        mockMvc.perform(get("/api/public/exhibitions/{exhibitionId}", draftExhibitionId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXHIBITION_NOT_FOUND"));
    }

    @Test
    void serializesCoverSelectionAndCoverItemRemoval() throws Exception {
        long exhibitionId = insertExhibition("Cover concurrency");
        long artworkId = insertArtwork("cover-concurrency");
        long itemId = insertExhibitionItem(exhibitionId, artworkId, 1);

        AtomicInteger lockLookups = new AtomicInteger();
        CountDownLatch coverLockAcquired = new CountDownLatch(1);
        CountDownLatch removalLockLookupStarted = new CountDownLatch(1);
        CountDownLatch releaseCoverSelection = new CountDownLatch(1);
        pauseFirstLockedLookup(exhibitionId, lockLookups, coverLockAcquired, removalLockLookupStarted, releaseCoverSelection);

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> selectCover = callers.submit(() -> mockMvc.perform(
                            put("/api/exhibitions/{exhibitionId}/cover", exhibitionId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"artworkId\":%d}".formatted(artworkId))
                    ).andReturn());
            assertTrue(coverLockAcquired.await(5, TimeUnit.SECONDS));

            Future<MvcResult> removeItem = callers.submit(() -> mockMvc.perform(
                            delete("/api/exhibitions/{exhibitionId}/items/{itemId}", exhibitionId, itemId)
                    ).andReturn());
            assertTrue(removalLockLookupStarted.await(5, TimeUnit.SECONDS));
            releaseCoverSelection.countDown();

            assertEquals(200, selectCover.get(10, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(200, removeItem.get(10, TimeUnit.SECONDS).getResponse().getStatus());
        } finally {
            releaseCoverSelection.countDown();
            callers.shutdownNow();
            reset(exhibitionRepository);
        }

        assertNull(jdbcTemplate.queryForObject(
                "SELECT cover_artwork_id FROM exhibitions WHERE id = ?", Long.class, exhibitionId
        ));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE id = ?", Integer.class, itemId
        ));
    }

    @Test
    void serializesPublicationBeforeAConcurrentMetadataMutation() throws Exception {
        long exhibitionId = insertExhibition("Publication concurrency");
        long artworkId = insertArtwork("publication-concurrency");
        insertExhibitionItem(exhibitionId, artworkId, 1);
        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", artworkId, exhibitionId);

        AtomicInteger lockLookups = new AtomicInteger();
        CountDownLatch publicationLockAcquired = new CountDownLatch(1);
        CountDownLatch updateLockLookupStarted = new CountDownLatch(1);
        CountDownLatch releasePublication = new CountDownLatch(1);
        pauseFirstLockedLookup(
                exhibitionId,
                lockLookups,
                publicationLockAcquired,
                updateLockLookupStarted,
                releasePublication
        );

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> publish = callers.submit(() -> mockMvc.perform(
                            post("/api/exhibitions/{exhibitionId}/publish", exhibitionId)
                    ).andReturn());
            assertTrue(publicationLockAcquired.await(5, TimeUnit.SECONDS));

            Future<MvcResult> update = callers.submit(() -> mockMvc.perform(
                            put("/api/exhibitions/{exhibitionId}", exhibitionId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"title\":\"Should not persist\"}")
                    ).andReturn());
            assertTrue(updateLockLookupStarted.await(5, TimeUnit.SECONDS));
            releasePublication.countDown();

            assertEquals(200, publish.get(10, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(409, update.get(10, TimeUnit.SECONDS).getResponse().getStatus());
        } finally {
            releasePublication.countDown();
            callers.shutdownNow();
            reset(exhibitionRepository);
        }

        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT status FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
        assertEquals("Publication concurrency", jdbcTemplate.queryForObject(
                "SELECT title FROM exhibitions WHERE id = ?", String.class, exhibitionId
        ));
    }

    @Test
    void serializesDraftDeletionAfterAConcurrentMetadataUpdate() throws Exception {
        long exhibitionId = insertExhibition("Deletion concurrency");
        long artworkId = insertArtwork("deletion-concurrency");
        insertExhibitionItem(exhibitionId, artworkId, 1);

        AtomicInteger lockLookups = new AtomicInteger();
        CountDownLatch updateLockAcquired = new CountDownLatch(1);
        CountDownLatch deletionLockLookupStarted = new CountDownLatch(1);
        CountDownLatch releaseUpdate = new CountDownLatch(1);
        pauseFirstLockedLookup(
                exhibitionId,
                lockLookups,
                updateLockAcquired,
                deletionLockLookupStarted,
                releaseUpdate
        );

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> update = callers.submit(() -> mockMvc.perform(
                            put("/api/exhibitions/{exhibitionId}", exhibitionId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"title\":\"Updated before deletion\"}")
                    ).andReturn());
            assertTrue(updateLockAcquired.await(5, TimeUnit.SECONDS));

            Future<MvcResult> delete = callers.submit(() -> mockMvc.perform(
                            delete("/api/exhibitions/{exhibitionId}", exhibitionId)
                    ).andReturn());
            assertTrue(deletionLockLookupStarted.await(5, TimeUnit.SECONDS));
            releaseUpdate.countDown();

            assertEquals(200, update.get(10, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(204, delete.get(10, TimeUnit.SECONDS).getResponse().getStatus());
        } finally {
            releaseUpdate.countDown();
            callers.shutdownNow();
            reset(exhibitionRepository);
        }

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibitions WHERE id = ?", Integer.class, exhibitionId
        ));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?", Integer.class, exhibitionId
        ));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM artworks WHERE id = ?", Integer.class, artworkId
        ));
    }

    private void pauseFirstLockedLookup(
            long exhibitionId,
            AtomicInteger lockLookups,
            CountDownLatch firstLockAcquired,
            CountDownLatch secondLockLookupStarted,
            CountDownLatch releaseFirstLock
    ) {
        doAnswer(invocation -> {
            int lookupNumber = lockLookups.incrementAndGet();
            if (lookupNumber == 2) {
                secondLockLookupStarted.countDown();
            }

            Optional<Exhibition> exhibition = entityManager.createQuery(
                            "select exhibition from Exhibition exhibition where exhibition.id = :exhibitionId",
                            Exhibition.class
                    )
                    .setParameter("exhibitionId", exhibitionId)
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultStream()
                    .findFirst();
            if (lookupNumber == 1) {
                firstLockAcquired.countDown();
                releaseFirstLock.await(5, TimeUnit.SECONDS);
            }
            return exhibition;
        }).when(exhibitionRepository).findByIdForUpdate(exhibitionId);
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

    private void assertValidationError(MvcResult result, String field, String message) throws Exception {
        JsonNode response = readResponse(result);
        assertEquals("VALIDATION_ERROR", response.get("code").asString());
        assertEquals("The request contains invalid values.", response.get("message").asString());
        assertTrue(response.get("timestamp").isTextual());
        Instant.parse(response.get("timestamp").asString());
        assertEquals(1, response.get("fieldErrors").size());
        assertEquals(field, response.get("fieldErrors").get(0).get("field").asString());
        assertEquals(message, response.get("fieldErrors").get(0).get("message").asString());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder addArtworkRequest(
            long exhibitionId,
            String externalId
    ) {
        return post("/api/exhibitions/{exhibitionId}/items", exhibitionId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"source":"ART_INSTITUTE_OF_CHICAGO","externalId":"%s"}
                        """.formatted(externalId));
    }

    private int addArtworkStatus(long exhibitionId, String externalId) throws Exception {
        return mockMvc.perform(addArtworkRequest(exhibitionId, externalId))
                .andReturn()
                .getResponse()
                .getStatus();
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
                            '/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/thumbnail',
                            '/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display', true)
                        RETURNING id
                        """,
                Long.class,
                externalId
        );
    }

    private long insertExhibitionItem(long exhibitionId, long artworkId, int position) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO exhibition_items (exhibition_id, artwork_id, position) VALUES (?, ?, ?) RETURNING id",
                Long.class,
                exhibitionId,
                artworkId,
                position
        );
    }

    private void assertContinuousPositions(long exhibitionId) {
        List<Integer> positions = jdbcTemplate.queryForList(
                "SELECT position FROM exhibition_items WHERE exhibition_id = ? ORDER BY position",
                Integer.class,
                exhibitionId
        );
        for (int index = 0; index < positions.size(); index++) {
            assertEquals(index + 1, positions.get(index));
        }
    }

    private void assertItemIdsInOrder(long exhibitionId, long... expectedItemIds) {
        assertEquals(
                Arrays.stream(expectedItemIds).boxed().toList(),
                jdbcTemplate.queryForList(
                        "SELECT id FROM exhibition_items WHERE exhibition_id = ? ORDER BY position",
                        Long.class,
                        exhibitionId
                )
        );
    }

    private void assertExhibitionItemState(
            long exhibitionId,
            List<Long> expectedItemIds,
            List<String> expectedNotes
    ) {
        assertEquals(expectedItemIds, jdbcTemplate.queryForList(
                "SELECT id FROM exhibition_items WHERE exhibition_id = ? ORDER BY position",
                Long.class,
                exhibitionId
        ));
        assertEquals(expectedNotes, jdbcTemplate.queryForList(
                "SELECT curatorial_note FROM exhibition_items WHERE exhibition_id = ? ORDER BY position",
                String.class,
                exhibitionId
        ));
        assertEquals(expectedItemIds.size(), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exhibition_items WHERE exhibition_id = ?",
                Integer.class,
                exhibitionId
        ));
        assertContinuousPositions(exhibitionId);
    }

    private static HttpServer startMuseumServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
            server.setExecutor(MUSEUM_SERVER_EXECUTOR);
            server.createContext("/artworks/", exchange -> {
                DETAIL_REQUESTS.incrementAndGet();
                String externalId = exchange.getRequestURI().getPath().substring("/artworks/".length());
                awaitProviderResponseGate();
                writeJson(exchange, DETAIL_STATUS.get(), artworkDetail(externalId));
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to start museum test server.", exception);
        }
    }

    private static void awaitProviderResponseGate() throws IOException {
        CountDownLatch requestReady = DETAIL_REQUEST_READY.get();
        CountDownLatch responseGate = DETAIL_RESPONSE_GATE.get();
        if (requestReady == null || responseGate == null) {
            return;
        }

        requestReady.countDown();
        try {
            if (!responseGate.await(5, TimeUnit.SECONDS)) {
                throw new IOException("Timed out waiting to release museum provider response.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting to release museum provider response.", exception);
        }
    }

    private static void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] response = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, response.length);
        exchange.getResponseBody().write(response);
        exchange.close();
    }

    private static String artworkDetail(String externalId) {
        return """
                {
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "https://www.artic.edu"},
                  "data": {
                    "id": %s,
                    "title": "Artwork %s",
                    "image_id": "123e4567-e89b-12d3-a456-426614174000",
                    "is_public_domain": true
                  }
                }
                """.formatted(externalId, externalId);
    }

    private record ExhibitionRequest(String title, String summary, String introduction) {
    }
}
