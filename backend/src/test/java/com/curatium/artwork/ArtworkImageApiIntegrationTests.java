package com.curatium.artwork;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.curatium.artwork.application.ArtworkImageValidator;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ArtworkImageApiIntegrationTests {

    private static final byte[] JPEG = loadPackagedJpeg();
    private static final AtomicInteger REQUESTS = new AtomicInteger();
    private static final AtomicInteger RESPONSE_STATUS = new AtomicInteger(200);
    private static final AtomicReference<String> CONTENT_TYPE = new AtomicReference<>("image/jpeg");
    private static final AtomicReference<byte[]> RESPONSE_BODY = new AtomicReference<>(JPEG);
    private static final AtomicReference<CountDownLatch> REQUEST_STARTED = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> RELEASE_RESPONSE = new AtomicReference<>();
    private static final AtomicInteger RESPONSE_DELAY_MILLIS = new AtomicInteger();
    private static final HttpServer IMAGE_SERVER = startImageServer();
    private static final Path CACHE_DIRECTORY = createCacheDirectory();

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @DynamicPropertySource
    static void imageProperties(DynamicPropertyRegistry registry) {
        registry.add("curatium.art-institute.base-url", () -> "http://localhost:" + IMAGE_SERVER.getAddress().getPort());
        registry.add("curatium.art-institute.iiif-base-url", () -> "http://localhost:" + IMAGE_SERVER.getAddress().getPort() + "/iiif/2");
        registry.add("curatium.art-institute.read-timeout", () -> "2s");
        registry.add("curatium.art-institute.image-cache-directory", CACHE_DIRECTORY::toString);
    }

    @AfterAll
    static void stopServer() {
        IMAGE_SERVER.stop(0);
    }

    @BeforeEach
    void resetImageServer() {
        REQUESTS.set(0);
        RESPONSE_STATUS.set(200);
        CONTENT_TYPE.set("image/jpeg");
        RESPONSE_BODY.set(JPEG);
        REQUEST_STARTED.set(null);
        RELEASE_RESPONSE.set(null);
        RESPONSE_DELAY_MILLIS.set(0);
    }

    @Test
    void rejectsInvalidIdentifiersAndVariantsWithoutAnyUpstreamRequest() throws Exception {
        mockMvc.perform(get("/api/artwork-images/art-institute/not-a-uuid/thumbnail"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(header().string("Cache-Control", "no-store"));
        mockMvc.perform(get("/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/original"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(header().string("Cache-Control", "no-store"));
        mockMvc.perform(get("/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111%2Fexample.test/thumbnail"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("Cache-Control", "no-store"));
        assertEquals(0, REQUESTS.get());
    }

    @Test
    void marksEveryArtworkImageRouteErrorAsNoStore() throws Exception {
        mockMvc.perform(get("/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ARTWORK_IMAGE_NOT_FOUND"))
                .andExpect(header().string("Cache-Control", "no-store"));

        RESPONSE_STATUS.set(503);
        mockMvc.perform(get("/api/artwork-images/art-institute/77777777-7777-7777-7777-777777777777/display"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ARTWORK_IMAGE_UNAVAILABLE"))
                .andExpect(header().string("Cache-Control", "no-store"));

        mockMvc.perform(get("/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display/extra"))
                .andExpect(status().isNotFound())
                .andExpect(header().string("Cache-Control", "no-store"));

        mockMvc.perform(post("/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string("Allow", "GET"))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void servesValidatedJpegThenReusesTheFilesystemCacheWithStableValidators() throws Exception {
        String path = "/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail";
        MvcResult first = mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().exists("ETag"))
                .andExpect(header().string("Cache-Control", "max-age=86400, public"))
                .andReturn();
        String eTag = first.getResponse().getHeader("ETag");
        assertEquals(1, REQUESTS.get());

        RESPONSE_STATUS.set(503);
        mockMvc.perform(get(path).header("If-None-Match", eTag))
                .andExpect(status().isNotModified())
                .andExpect(header().string("ETag", eTag));
        mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", eTag));
        assertEquals(1, REQUESTS.get());
    }

    @Test
    void invalidCachedContentIsDeletedAndRecoveredFromTheProvider() throws Exception {
        String imageId = "44444444-4444-4444-4444-444444444444";
        writeCachedImage(imageId, "display", "not-a-jpeg".getBytes());

        MvcResult result = mockMvc.perform(get("/api/artwork-images/art-institute/{imageId}/display", imageId))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andReturn();

        assertArrayEquals(JPEG, result.getResponse().getContentAsByteArray());
        assertEquals(1, REQUESTS.get());
        assertTrue(Files.isRegularFile(cachePath(imageId, "display")));
    }

    @Test
    void oversizedCachedContentIsDeletedBeforeProviderRecovery() throws Exception {
        String imageId = "55555555-5555-5555-5555-555555555555";
        writeCachedImage(imageId, "display", new byte[ArtworkImageValidator.MAXIMUM_IMAGE_BYTES + 1]);

        MvcResult result = mockMvc.perform(get("/api/artwork-images/art-institute/{imageId}/display", imageId))
                .andExpect(status().isOk())
                .andReturn();

        assertArrayEquals(JPEG, result.getResponse().getContentAsByteArray());
        assertEquals(1, REQUESTS.get());
        assertTrue(Files.size(cachePath(imageId, "display")) < ArtworkImageValidator.MAXIMUM_IMAGE_BYTES);
    }

    @Test
    void invalidCachedContentIsDeletedWhenProviderRecoveryFails() throws Exception {
        String imageId = "66666666-6666-6666-6666-666666666666";
        writeCachedImage(imageId, "display", "not-a-jpeg".getBytes());
        RESPONSE_STATUS.set(503);

        mockMvc.perform(get("/api/artwork-images/art-institute/{imageId}/display", imageId))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ARTWORK_IMAGE_UNAVAILABLE"))
                .andExpect(header().string("Cache-Control", "no-store"));

        assertEquals(1, REQUESTS.get());
        assertFalse(Files.exists(cachePath(imageId, "display")));
    }

    @Test
    void coalescesConcurrentRequestsForTheSameImageVariant() throws Exception {
        String path = "/api/artwork-images/art-institute/22222222-2222-2222-2222-222222222222/display";
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        REQUEST_STARTED.set(started);
        RELEASE_RESPONSE.set(release);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> first = callers.submit(() -> mockMvc.perform(get(path)).andReturn());
            assertTrue(started.await(2, TimeUnit.SECONDS));
            Future<MvcResult> second = callers.submit(() -> mockMvc.perform(get(path)).andReturn());
            assertEquals(1, REQUESTS.get());
            release.countDown();
            assertEquals(200, first.get(3, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(200, second.get(3, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(1, REQUESTS.get());
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    void mapsProviderFailuresAndInvalidResponsesToStructuredImageErrors() throws Exception {
        assertFailure(333, 404, "image/jpeg", JPEG, 404, "ARTWORK_IMAGE_NOT_FOUND");
        assertFailure(334, 403, "text/html", "challenge".getBytes(), 503, "ARTWORK_IMAGE_UNAVAILABLE");
        assertFailure(335, 200, "text/html", "challenge".getBytes(), 503, "ARTWORK_IMAGE_UNAVAILABLE");
        assertFailure(336, 200, "image/jpeg", "not-a-jpeg".getBytes(), 503, "ARTWORK_IMAGE_UNAVAILABLE");
        assertFailure(337, 503, "image/jpeg", JPEG, 503, "ARTWORK_IMAGE_UNAVAILABLE");
        assertFailure(340, 302, "image/jpeg", JPEG, 503, "ARTWORK_IMAGE_UNAVAILABLE");
    }

    @Test
    void rejectsOversizedAndTimedOutProviderResponses() throws Exception {
        byte[] oversized = new byte[8 * 1024 * 1024 + 1];
        oversized[0] = (byte) 0xff;
        oversized[1] = (byte) 0xd8;
        oversized[2] = (byte) 0xff;
        oversized[oversized.length - 2] = (byte) 0xff;
        oversized[oversized.length - 1] = (byte) 0xd9;
        assertFailure(338, 200, "image/jpeg", oversized, 503, "ARTWORK_IMAGE_UNAVAILABLE");

        RESPONSE_DELAY_MILLIS.set(2_500);
        assertFailure(339, 200, "image/jpeg", JPEG, 503, "ARTWORK_IMAGE_UNAVAILABLE");
    }

    @Test
    void servesEveryPackagedDemoVariantWithoutCallingTheProvider() throws Exception {
        List<String> imageIds = List.of(
                "47c5bcb8-62ef-e5d7-55e7-f5121f409a30",
                "3ccdfe37-97e5-4849-2ee9-aef8e7e27595",
                "ff3b5c8a-5b14-5c35-8775-3d021e92a381",
                "360e3e61-bb1c-1eb5-a9f5-e620f305b75b"
        );
        for (String imageId : imageIds) {
            for (String variant : List.of("thumbnail", "display")) {
                mockMvc.perform(get("/api/artwork-images/art-institute/{imageId}/{variant}", imageId, variant))
                        .andExpect(status().isOk())
                        .andExpect(header().string("Content-Type", "image/jpeg"));
            }
        }
        assertEquals(0, REQUESTS.get());
    }

    private void assertFailure(
            int suffix,
            int upstreamStatus,
            String contentType,
            byte[] body,
            int expectedStatus,
            String expectedCode
    ) throws Exception {
        RESPONSE_STATUS.set(upstreamStatus);
        CONTENT_TYPE.set(contentType);
        RESPONSE_BODY.set(body);
        String imageId = "00000000-0000-0000-0000-%012d".formatted(suffix);
        mockMvc.perform(get("/api/artwork-images/art-institute/{imageId}/display", imageId))
                .andExpect(status().is(expectedStatus))
                .andExpect(jsonPath("$.code").value(expectedCode))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    private static HttpServer startImageServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
            server.createContext("/iiif/2/", ArtworkImageApiIntegrationTests::writeImage);
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to start image test server.", exception);
        }
    }

    private static void writeImage(HttpExchange exchange) throws IOException {
        REQUESTS.incrementAndGet();
        CountDownLatch started = REQUEST_STARTED.get();
        CountDownLatch release = RELEASE_RESPONSE.get();
        if (started != null && release != null) {
            started.countDown();
            try {
                release.await(3, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while waiting to release image response.", exception);
            }
        }
        int responseDelayMillis = RESPONSE_DELAY_MILLIS.get();
        if (responseDelayMillis > 0) {
            try {
                Thread.sleep(responseDelayMillis);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while delaying image response.", exception);
            }
        }
        byte[] body = RESPONSE_BODY.get();
        exchange.getResponseHeaders().set("Content-Type", CONTENT_TYPE.get());
        exchange.sendResponseHeaders(RESPONSE_STATUS.get(), body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static Path createCacheDirectory() {
        try {
            return Files.createTempDirectory("curatium-artwork-image-tests");
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to create test image cache.", exception);
        }
    }

    private static void writeCachedImage(String imageId, String variant, byte[] bytes) throws IOException {
        Path path = cachePath(imageId, variant);
        Files.createDirectories(path.getParent());
        Files.write(path, bytes);
    }

    private static Path cachePath(String imageId, String variant) {
        return CACHE_DIRECTORY.resolve(imageId).resolve(variant + ".jpg");
    }

    private static byte[] loadPackagedJpeg() {
        try (InputStream input = ArtworkImageApiIntegrationTests.class.getClassLoader().getResourceAsStream(
                "demo-artwork-images/47c5bcb8-62ef-e5d7-55e7-f5121f409a30-thumbnail.jpg"
        )) {
            if (input == null) {
                throw new IllegalStateException("Missing packaged demo JPEG.");
            }
            return input.readAllBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read packaged demo JPEG.", exception);
        }
    }
}
