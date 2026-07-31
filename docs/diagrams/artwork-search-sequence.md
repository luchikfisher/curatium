# Artwork search sequence

```mermaid
sequenceDiagram
    actor Curator
    participant FE as React artwork search page
    participant API as GET /api/museum/artworks
    participant Search as MuseumArtworkSearchService.search
    participant AIC as ArtInstituteClient
    participant Provider as Art Institute API

    Curator->>FE: Submit query, page, and page size
    FE->>API: Send GET request with q, page, size, and AbortSignal
    API->>API: Validate page is at least 1
    API->>API: Validate size is between 1 and 20

    alt Page or size is invalid
        API-->>FE: 400 VALIDATION_ERROR with fieldErrors
    else Pagination parameters are valid
        API->>Search: search(q, page, size)
        Search->>Search: Trim the query
        Search->>Search: Require between 2 and 100 characters

        alt Normalized query is invalid
            Search-->>API: InvalidMuseumSearchRequestException
            API-->>FE: 400 VALIDATION_ERROR with q fieldError
        else Normalized query is valid
            Search->>AIC: search(normalizedQuery, page, size)
            AIC->>Provider: Search using page, limit, and selected fields

            alt Provider request succeeds
                Provider-->>AIC: Raw provider results and pagination
                AIC->>AIC: Keep public-domain results with an image ID
                AIC->>AIC: Map IIIF and source URLs into MuseumArtworkSearchPage
                AIC-->>Search: Mapped Curatium search page
                Search-->>API: Search page with items and pagination
                API-->>FE: 200 Curatium search page
            else Provider request fails
                Provider-->>AIC: Timeout, transport error, malformed response, or 5xx
                AIC-->>Search: ArtInstituteIntegrationException
                Search-->>API: ArtInstituteIntegrationException
                API-->>FE: 503 MUSEUM_SERVICE_UNAVAILABLE
            end
        end
    end
```

The frontend never calls the museum provider directly. The controller validates pagination before
calling `MuseumArtworkSearchService`, which normalizes and validates the query before delegating.
`ArtInstituteClient` owns the provider request, applies its configured timeouts, filters unusable
results, maps IIIF and source URLs, and returns the `MuseumArtworkSearchPage`.

Curatium exposes only the reliable pagination fields: `page`, `pageSize`, and `hasNextPage`.

Cancellation is shown at the frontend request boundary rather than as a guaranteed cancellation of
the provider request. When the browser request is aborted, the page ignores the result. The backend
provider call remains governed by the configured HTTP client timeouts.
