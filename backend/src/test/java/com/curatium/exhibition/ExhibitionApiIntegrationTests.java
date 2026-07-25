package com.curatium.exhibition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
                    "image_id": "image-%s",
                    "is_public_domain": true
                  }
                }
                """.formatted(externalId, externalId, externalId);
    }

    private record ExhibitionRequest(String title, String summary, String introduction) {
    }
}
