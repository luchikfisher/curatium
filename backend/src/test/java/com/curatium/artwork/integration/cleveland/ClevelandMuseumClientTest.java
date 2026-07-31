package com.curatium.artwork.integration.cleveland;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.curatium.artwork.application.MuseumArtworkSearchResult;
import com.curatium.artwork.domain.ArtworkSource;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

class ClevelandMuseumClientTest {

    private final AtomicInteger responseStatus = new AtomicInteger(200);
    private final AtomicReference<String> responseBody = new AtomicReference<>();
    private final AtomicInteger responseDelayMillis = new AtomicInteger();
    private final AtomicReference<String> requestedQuery = new AtomicReference<>();
    private final AtomicReference<String> requestedPath = new AtomicReference<>();

    private HttpServer server;
    private ClevelandMuseumClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/artworks/", this::respond);
        server.start();
        responseBody.set(successResponse());
        responseStatus.set(200);
        responseDelayMillis.set(0);
        requestedQuery.set(null);
        requestedPath.set(null);

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(250))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(100));
        client = new ClevelandMuseumClient(RestClient.builder()
                .baseUrl("http://localhost:" + server.getAddress().getPort())
                .requestFactory(requestFactory)
                .build());
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void mapsQueryPaginationCc0ImageEligibilityAndPartialMetadata() {
        MuseumArtworkSearchPage page = client.search("night", 2, 20);

        assertEquals("q=night&cc0=1&has_image=1&limit=20&skip=20", requestedQuery.get());
        assertEquals(2, page.page());
        assertEquals(20, page.pageSize());
        assertTrue(page.hasNextPage());
        assertEquals(3, page.items().size());

        MuseumArtworkSearchResult complete = page.items().getFirst();
        assertEquals(ArtworkSource.CLEVELAND_MUSEUM_OF_ART, complete.source());
        assertEquals("1947.209", complete.externalId());
        assertEquals("Vincent van Gogh (Dutch, 1853–1890)", complete.artistDisplay());
        assertEquals("1889", complete.dateDisplay());
        assertEquals("oil on fabric — Unframed: 73.4 x 91.8 cm", complete.mediumDisplay());
        assertEquals("https://clevelandart.org/art/1947.209", complete.sourceUrl());
        assertEquals("/api/artwork-images/cleveland/1947.209/thumbnail", complete.thumbnailUrl());
        assertEquals("/api/artwork-images/cleveland/1947.209/display", complete.imageUrl());

        MuseumArtworkSearchResult partial = page.items().get(1);
        assertNull(partial.artistDisplay());
        assertNull(partial.dateDisplay());
        assertEquals("12.0 x 8.0 cm", partial.mediumDisplay());
    }

    @Test
    void mapsAnImportableArtworkRecordFromTheAccessionEndpoint() {
        responseBody.set(detailResponse());

        MuseumArtworkSearchResult artwork = client.getArtwork("1947.209");

        assertEquals("/api/artworks/1947.209", requestedPath.get());
        assertEquals("1947.209", artwork.externalId());
        assertEquals("The Large Plane Trees", artwork.title());
        assertEquals("/api/artwork-images/cleveland/1947.209/thumbnail", artwork.thumbnailUrl());
        assertEquals("/api/artwork-images/cleveland/1947.209/display", artwork.imageUrl());
    }

    @Test
    void rejectsMissingAndMalformedImportRecords() {
        responseStatus.set(404);
        assertThrows(ClevelandMuseumArtworkNotFoundException.class, () -> client.getArtwork("1947.209"));

        responseStatus.set(200);
        responseBody.set("{\"data\": {}}");
        assertThrows(ClevelandMuseumIntegrationException.class, () -> client.getArtwork("1947.209"));

        responseBody.set("{\"data\": null}");
        assertThrows(ClevelandMuseumIntegrationException.class, () -> client.getArtwork("1947.209"));
    }

    @Test
    void mapsNonCc0AndMissingWebImageImportRecordsForImportLayerClassification() {
        responseBody.set(detailResponse().replace("\"CC0\"", "\"Copyrighted\""));
        MuseumArtworkSearchResult nonCc0 = client.getArtwork("1947.209");
        assertTrue(!nonCc0.publicDomain());

        responseBody.set("""
                {
                  "data": {
                    "accession_number": "1947.209",
                    "title": "The Large Plane Trees",
                    "share_license_status": "CC0"
                  }
                }
                """);
        MuseumArtworkSearchResult missingWebImage = client.getArtwork("1947.209");
        assertNull(missingWebImage.thumbnailUrl());
        assertNull(missingWebImage.imageUrl());
    }

    @Test
    void mapsAnEmptySearchPage() {
        responseBody.set("""
                {"info": {"total": 0}, "data": []}
                """);

        MuseumArtworkSearchPage page = client.search("night", 1, 20);

        assertEquals(0, page.items().size());
        assertTrue(!page.hasNextPage());
    }

    @Test
    void ignoresNullArtworkEntries() {
        responseBody.set("""
                {
                  "info": {"total": 2},
                  "data": [null, {
                    "id": 125249,
                    "accession_number": "1947.209",
                    "share_license_status": "CC0",
                    "title": "The Large Plane Trees",
                    "images": {
                      "web": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_web.jpg"},
                      "print": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_print.jpg"}
                    }
                  }]
                }
                """);

        MuseumArtworkSearchPage page = client.search("night", 1, 20);

        assertEquals(1, page.items().size());
        assertEquals("1947.209", page.items().getFirst().externalId());
    }

    @Test
    void ignoresNullCreatorEntries() {
        responseBody.set(successResponse().replace(
                "[{\"description\": \"Vincent van Gogh (Dutch, 1853–1890)\"}]",
                "[null, {\"description\": \"Vincent van Gogh (Dutch, 1853–1890)\"}]"
        ));

        MuseumArtworkSearchPage page = client.search("night", 1, 20);

        assertEquals("Vincent van Gogh (Dutch, 1853–1890)", page.items().getFirst().artistDisplay());
    }

    @Test
    void skipsUnsafeAccessionRowsAlongsideValidRows() {
        responseBody.set("""
                {
                  "info": {"total": 3},
                  "data": [
                    null,
                    {
                      "id": 300,
                      "accession_number": "../../not-an-accession?image=1",
                      "share_license_status": "CC0",
                      "title": "Unsafe accession",
                      "images": {
                        "web": {"url": "https://example.test/web.jpg"},
                        "print": {"url": "https://example.test/print.jpg"}
                      }
                    },
                    {
                      "id": 125249,
                      "accession_number": "1947.209",
                      "share_license_status": "CC0",
                      "title": "The Large Plane Trees",
                      "images": {
                        "web": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_web.jpg"},
                        "print": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_print.jpg"}
                      }
                    }
                  ]
                }
                """);

        MuseumArtworkSearchPage page = client.search("night", 1, 20);

        assertEquals(1, page.items().size());
        assertEquals("1947.209", page.items().getFirst().externalId());
    }

    @Test
    void validatesClevelandAccessionNumbers() {
        assertTrue(ClevelandAccessionNumber.isCanonical("1947.209"));
        assertTrue(ClevelandAccessionNumber.isCanonical("2020.1"));
        assertTrue(ClevelandAccessionNumber.isCanonical("1954.512.1-.112"));

        assertTrue(!ClevelandAccessionNumber.isCanonical(null));
        assertTrue(!ClevelandAccessionNumber.isCanonical(""));
        assertTrue(!ClevelandAccessionNumber.isCanonical("1947. 209"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("../../1947.209"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("1947\\\\209"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("https://example.test/1947.209"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("1947.209?size=web"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("1947.209#fragment"));
        assertTrue(!ClevelandAccessionNumber.isCanonical("a".repeat(101)));
    }

    @Test
    void translatesProvider4xxAnd5xxResponses() {
        responseStatus.set(429);
        assertUnavailable();

        responseStatus.set(503);
        assertUnavailable();
    }

    @Test
    void translatesTimeoutsAndMalformedResponses() {
        responseDelayMillis.set(500);
        assertUnavailable();

        responseDelayMillis.set(0);
        responseBody.set("not-json");
        assertUnavailable();
    }

    @Test
    void rejectsResponsesMissingTheRequiredPageShape() {
        responseBody.set("""
                {"info": {}, "data": null}
                """);

        ClevelandMuseumIntegrationException exception = assertThrows(
                ClevelandMuseumIntegrationException.class,
                () -> client.search("night", 1, 20)
        );

        assertEquals("The Cleveland Museum of Art returned an unusable response.", exception.getMessage());
    }

    private void assertUnavailable() {
        ClevelandMuseumIntegrationException exception = assertThrows(
                ClevelandMuseumIntegrationException.class,
                () -> client.search("night", 1, 20)
        );
        assertEquals("The Cleveland Museum of Art service is unavailable.", exception.getMessage());
    }

    private void respond(HttpExchange exchange) throws IOException {
        requestedPath.set(exchange.getRequestURI().getPath());
        requestedQuery.set(exchange.getRequestURI().getQuery());
        try {
            Thread.sleep(responseDelayMillis.get());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while delaying provider response.", exception);
        }
        byte[] body = responseBody.get().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(responseStatus.get(), body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private String successResponse() {
        return """
                {
                  "info": {"total": 41},
                  "data": [
                    {
                      "id": 125249,
                      "accession_number": "1947.209",
                      "share_license_status": "CC0",
                      "title": "The Large Plane Trees",
                      "creation_date": "1889",
                      "creators": [{"description": "Vincent van Gogh (Dutch, 1853–1890)"}],
                      "technique": "oil on fabric",
                      "measurements": "Unframed: 73.4 x 91.8 cm",
                      "url": "https://clevelandart.org/art/1947.209",
                      "creditline": "The Severance and Greta Millikin Purchase Fund",
                      "images": {
                        "web": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_web.jpg"},
                        "print": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_print.jpg"}
                      }
                    },
                    {
                      "id": 200,
                      "accession_number": "2020.1",
                      "share_license_status": "CC0",
                      "title": "Untitled Study",
                      "creators": [],
                      "measurements": "12.0 x 8.0 cm",
                      "images": {
                        "web": {"url": "https://openaccess-cdn.clevelandart.org/2020.1/2020.1_web.jpg"},
                        "print": {"url": "https://openaccess-cdn.clevelandart.org/2020.1/2020.1_print.jpg"}
                      }
                    },
                    {
                      "id": 201,
                      "share_license_status": "Copyrighted",
                      "title": "Not CC0",
                      "images": {
                        "web": {"url": "https://example.test/web.jpg"},
                        "print": {"url": "https://example.test/print.jpg"}
                      }
                    },
                    {
                      "id": 202,
                      "accession_number": "2020.2",
                      "share_license_status": "CC0",
                      "title": "No print derivative",
                      "images": {"web": {"url": "https://example.test/web.jpg"}}
                    }
                  ]
                }
                """;
    }

    private String detailResponse() {
        return """
                {
                  "data": {
                    "id": 125249,
                    "accession_number": "1947.209",
                    "share_license_status": "CC0",
                    "title": "The Large Plane Trees",
                    "creators": [{"description": "Vincent van Gogh"}],
                    "images": {
                      "web": {"url": "https://openaccess-cdn.clevelandart.org/1947.209/1947.209_web.jpg"}
                    }
                  }
                }
                """;
    }
}
