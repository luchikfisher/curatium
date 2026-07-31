package com.curatium.artwork;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.curatium.artwork.application.ArtworkImportService;
import com.curatium.artwork.application.ArtworkNotImportableException;
import com.curatium.artwork.domain.Artwork;
import com.curatium.artwork.domain.ArtworkSource;
import com.curatium.artwork.integration.artinstitute.ArtInstituteIntegrationException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ArtworkApiIntegrationTests {

    private static final AtomicReference<String> DETAIL_BODY = new AtomicReference<>();
    private static final AtomicInteger DETAIL_STATUS = new AtomicInteger();
    private static final AtomicInteger DETAIL_REQUESTS = new AtomicInteger();
    private static final AtomicInteger SEARCH_STATUS = new AtomicInteger();
    private static final AtomicReference<String> SEARCH_QUERY = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> DETAIL_REQUEST_BARRIER = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> DETAIL_RESPONSE_GATE = new AtomicReference<>();
    private static final ExecutorService MUSEUM_SERVER_EXECUTOR = Executors.newFixedThreadPool(4);
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
    private ArtworkImportService artworkImportService;

    @DynamicPropertySource
    static void museumProperties(DynamicPropertyRegistry registry) {
        registry.add("curatium.art-institute.base-url",
                () -> "http://localhost:" + MUSEUM_SERVER.getAddress().getPort());
    }

    @AfterAll
    static void stopMuseumServer() {
        MUSEUM_SERVER.stop(0);
        MUSEUM_SERVER_EXECUTOR.shutdownNow();
    }

    @BeforeEach
    void resetState() {
        jdbcTemplate.execute("TRUNCATE TABLE exhibition_items, exhibitions, artworks RESTART IDENTITY CASCADE");
        DETAIL_STATUS.set(200);
        DETAIL_BODY.set(publicArtworkDetail());
        DETAIL_REQUESTS.set(0);
        SEARCH_STATUS.set(200);
        SEARCH_QUERY.set(null);
        DETAIL_REQUEST_BARRIER.set(null);
        DETAIL_RESPONSE_GATE.set(null);
    }

    @Test
    void searchesMuseumArtworksWithValidatedPagination() throws Exception {
        mockMvc.perform(get("/api/museum/artworks")
                        .param("q", " night ")
                        .param("page", "2")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.pageSize").value(10))
                .andExpect(jsonPath("$.hasNextPage").value(true))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].externalId").value("154235"))
                .andExpect(jsonPath("$.items[0].publicDomain").value(true))
                .andExpect(jsonPath("$.items[0].thumbnailUrl").value(
                        "/api/artwork-images/art-institute/d7df2633-3b40-f570-c906-211503a37cde/thumbnail"))
                .andExpect(jsonPath("$.items[0].imageUrl").value(
                        "/api/artwork-images/art-institute/d7df2633-3b40-f570-c906-211503a37cde/display"));
        assertEquals("q=night&page=2&limit=10&fields=id,title,artist_display,date_display,medium_display,image_id,credit_line,is_public_domain",
                SEARCH_QUERY.get());

        mockMvc.perform(get("/api/museum/artworks")
                        .param("q", "a "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("q"));
    }

    @Test
    void mapsMuseumSearchProviderFailuresToTheDocumentedRetryableApiError() throws Exception {
        SEARCH_STATUS.set(503);

        MvcResult result = mockMvc.perform(get("/api/museum/artworks").param("q", "night"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("MUSEUM_SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value("The museum service is temporarily unavailable."))
                .andExpect(jsonPath("$.fieldErrors.length()").value(0))
                .andExpect(jsonPath("$.timestamp").isString())
                .andReturn();

        Instant.parse(objectMapper.readTree(result.getResponse().getContentAsString()).get("timestamp").asString());
    }

    @Test
    void importsAnAuthoritativeArtworkSnapshot() {
        Artwork artwork = importArtwork("154235");

        assertEquals(ArtworkSource.ART_INSTITUTE_OF_CHICAGO, artwork.getSource());
        assertEquals("The Girl by the Window", artwork.getTitle());
        assertEquals("/api/artwork-images/art-institute/d7df2633-3b40-f570-c906-211503a37cde/display", artwork.getImageUrl());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
        assertEquals("154235", jdbcTemplate.queryForObject(
                "SELECT external_id FROM artworks WHERE id = ?", String.class, artwork.getId()
        ));
        assertEquals(1, DETAIL_REQUESTS.get());
    }

    @Test
    void reusesAnExistingArtworkSnapshotWithoutCallingTheProviderAgain() {
        long firstId = importArtwork("154235").getId();

        DETAIL_STATUS.set(503);
        long secondId = importArtwork("154235").getId();

        assertEquals(firstId, secondId);
        assertEquals(1, DETAIL_REQUESTS.get());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
    }

    @Test
    void rejectsArtworksThatAreNotPublicDomain() {
        DETAIL_BODY.set("""
                {
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "https://www.artic.edu"},
                  "data": {"id": 154235, "title": "Private artwork", "is_public_domain": false}
                }
                """);

        ArtworkNotImportableException exception = assertThrows(
                ArtworkNotImportableException.class,
                () -> importArtwork("154235")
        );

        assertEquals("Only public-domain artworks can be imported.", exception.getMessage());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
    }

    @Test
    void rejectsArtworksWithoutAUsableImage() {
        DETAIL_BODY.set("""
                {
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "https://www.artic.edu"},
                  "data": {"id": 154235, "title": "Artwork without image", "is_public_domain": true}
                }
                """);

        ArtworkNotImportableException exception = assertThrows(
                ArtworkNotImportableException.class,
                () -> importArtwork("154235")
        );

        assertEquals("The artwork does not have a usable image.", exception.getMessage());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
    }

    @Test
    void reportsProviderFailuresWithoutPersistingArtwork() {
        DETAIL_STATUS.set(503);

        assertThrows(ArtInstituteIntegrationException.class, () -> importArtwork("154235"));

        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
    }

    @Test
    void rejectsArtworksMissingFromTheProviderWithoutTreatingItAsAnOutage() {
        DETAIL_STATUS.set(404);

        ArtworkNotImportableException exception = assertThrows(
                ArtworkNotImportableException.class,
                () -> importArtwork("stale-id")
        );

        assertEquals("The artwork was not found by the museum provider.", exception.getMessage());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
    }

    @Test
    void concurrentFirstImportsReuseOnePersistedArtwork() throws Exception {
        CountDownLatch detailRequestsReady = new CountDownLatch(2);
        CountDownLatch releaseDetailResponses = new CountDownLatch(1);
        DETAIL_REQUEST_BARRIER.set(detailRequestsReady);
        DETAIL_RESPONSE_GATE.set(releaseDetailResponses);

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<Artwork> first = callers.submit(() -> importArtwork("154235"));
            Future<Artwork> second = callers.submit(() -> importArtwork("154235"));

            assertTrue(detailRequestsReady.await(5, TimeUnit.SECONDS));
            releaseDetailResponses.countDown();

            Artwork firstArtwork = first.get(10, TimeUnit.SECONDS);
            Artwork secondArtwork = second.get(10, TimeUnit.SECONDS);
            assertEquals(firstArtwork.getId(), secondArtwork.getId());
            assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM artworks", Integer.class));
        } finally {
            releaseDetailResponses.countDown();
            callers.shutdownNow();
        }
    }

    private Artwork importArtwork(String externalId) {
        return artworkImportService.importArtwork(ArtworkSource.ART_INSTITUTE_OF_CHICAGO, externalId);
    }

    private static HttpServer startMuseumServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
            server.setExecutor(MUSEUM_SERVER_EXECUTOR);
            server.createContext("/artworks/search", exchange -> {
                SEARCH_QUERY.set(exchange.getRequestURI().getQuery());
                writeJson(exchange, SEARCH_STATUS.get(), searchResponse());
            });
            server.createContext("/artworks/", exchange -> {
                DETAIL_REQUESTS.incrementAndGet();
                waitForConcurrentRequest();
                writeJson(exchange, DETAIL_STATUS.get(), DETAIL_BODY.get());
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to start museum test server.", exception);
        }
    }

    private static void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] response = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, response.length);
        exchange.getResponseBody().write(response);
        exchange.close();
    }

    private static void waitForConcurrentRequest() throws IOException {
        CountDownLatch requestBarrier = DETAIL_REQUEST_BARRIER.get();
        CountDownLatch responseGate = DETAIL_RESPONSE_GATE.get();
        if (requestBarrier == null || responseGate == null) {
            return;
        }

        requestBarrier.countDown();
        try {
            if (!responseGate.await(5, TimeUnit.SECONDS)) {
                throw new IOException("Timed out waiting to release museum responses.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting to release museum responses.", exception);
        }
    }

    private static String searchResponse() {
        return """
                {
                  "pagination": {"limit": 10, "current_page": 2, "next_url": "https://api.artic.edu/api/v1/artworks/search?page=3"},
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "https://www.artic.edu"},
                  "data": [
                    {"id": 154235, "title": "The Girl by the Window", "image_id": "d7df2633-3b40-f570-c906-211503a37cde", "is_public_domain": true},
                    {"id": 2, "title": "Private artwork", "image_id": "private-image", "is_public_domain": false}
                  ]
                }
                """;
    }

    private static String publicArtworkDetail() {
        return """
                {
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "https://www.artic.edu"},
                  "data": {
                    "id": 154235,
                    "title": "The Girl by the Window",
                    "artist_display": "Edvard Munch",
                    "date_display": "1893",
                    "medium_display": "Oil on canvas",
                    "image_id": "d7df2633-3b40-f570-c906-211503a37cde",
                    "credit_line": "Searle Family Trust",
                    "is_public_domain": true
                  }
                }
                """;
    }
}
