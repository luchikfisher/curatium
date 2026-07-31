package com.curatium.artwork.integration.artinstitute;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class ArtInstituteClientTest {

    private HttpServer server;
    private ArtInstituteClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.start();
        client = new ArtInstituteClient(RestClient.builder()
                .baseUrl("http://localhost:" + server.getAddress().getPort())
                .build());
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void mapsPublicDomainArtworksWithImagesIntoCuratiumSearchResults() {
        server.createContext("/artworks/search", exchange -> {
            assertTrue(exchange.getRequestURI().getQuery().contains("q=night"));
            assertTrue(exchange.getRequestURI().getQuery().contains("page=2"));
            assertTrue(exchange.getRequestURI().getQuery().contains("limit=20"));
            writeJson(exchange, 200, """
                    {
                      "pagination": {"limit": 20, "current_page": 2, "next_url": "https://api.artic.edu/api/v1/artworks/search?page=3"},
                      "config": {"iiif_url": "https://www.artic.edu/iiif/2", "website_url": "http://www.artic.edu"},
                      "data": [
                        {
                          "id": 154235,
                          "title": "The Girl by the Window",
                          "artist_display": "Edvard Munch",
                          "date_display": "1893",
                          "medium_display": "Oil on canvas",
                          "image_id": "d7df2633-3b40-f570-c906-211503a37cde",
                          "credit_line": "Searle Family Trust",
                          "is_public_domain": true
                        },
                        {"id": 2, "title": "Private", "image_id": "private-image", "is_public_domain": false},
                        {"id": 3, "title": "No image", "is_public_domain": true}
                      ]
                    }
                    """);
        });

        MuseumArtworkSearchPage page = client.search("night", 2, 20);

        assertEquals(2, page.page());
        assertEquals(20, page.pageSize());
        assertTrue(page.hasNextPage());
        assertEquals(1, page.items().size());
        assertEquals("154235", page.items().getFirst().externalId());
        assertEquals("/api/artwork-images/art-institute/d7df2633-3b40-f570-c906-211503a37cde/thumbnail",
                page.items().getFirst().thumbnailUrl());
        assertEquals("/api/artwork-images/art-institute/d7df2633-3b40-f570-c906-211503a37cde/display",
                page.items().getFirst().imageUrl());
        assertEquals("https://www.artic.edu/artworks/154235", page.items().getFirst().sourceUrl());
    }

    @Test
    void translatesProviderFailuresIntoAnIntegrationException() {
        server.createContext("/artworks/search", exchange -> writeJson(exchange, 503, "{\"error\":\"unavailable\"}"));

        ArtInstituteIntegrationException exception = assertThrows(
                ArtInstituteIntegrationException.class,
                () -> client.search("night", 1, 20)
        );

        assertEquals("The Art Institute of Chicago service is unavailable.", exception.getMessage());
    }

    @Test
    void rejectsIncompleteProviderPayloadsWithoutReturningSearchResults() {
        server.createContext("/artworks/search", exchange -> writeJson(exchange, 200, """
                {
                  "pagination": {"limit": 20, "current_page": 1, "next_url": null},
                  "config": {"iiif_url": "https://www.artic.edu/iiif/2"},
                  "data": [
                    {"id": 154235, "title": "The Girl by the Window", "image_id": "d7df2633-3b40-f570-c906-211503a37cde", "is_public_domain": true}
                  ]
                }
                """));

        ArtInstituteIntegrationException exception = assertThrows(
                ArtInstituteIntegrationException.class,
                () -> client.search("night", 1, 20)
        );

        assertEquals("The Art Institute of Chicago returned an unusable response.", exception.getMessage());
    }

    private void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] response = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, response.length);
        exchange.getResponseBody().write(response);
        exchange.close();
    }
}
