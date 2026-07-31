# Artwork search sequence

```mermaid
sequenceDiagram
    actor Curator
    participant FE as React artwork search page
    participant API as GET /api/museum/artworks
    participant Search as MuseumArtworkSearchService.search
    participant AIC as Art Institute API

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
            Search->>AIC: Search using page, limit, and selected fields

            alt Provider request succeeds
                AIC-->>Search: Provider results and pagination
                Search->>Search: Keep public-domain results with an image ID
                Search->>Search: Map IIIF URLs and source URLs
                Search-->>API: Search page with items and pagination
                API-->>FE: 200 Curatium search page
            else Provider request fails
                AIC-->>Search: Timeout, transport error, malformed response, or 5xx
                Search-->>API: ArtInstituteIntegrationException
                API-->>FE: 503 MUSEUM_SERVICE_UNAVAILABLE
            end
        end
    end
```

The frontend never calls the museum provider directly. The controller validates pagination before
calling `MuseumArtworkSearchService`, which normalizes and validates the query. `ArtInstituteClient`
owns the provider request, applies its configured timeouts, and returns the provider response.

After receiving the provider response, the search flow filters out unusable results and maps the
remaining items to Curatium responses. Curatium exposes only the reliable pagination fields:
`page`, `pageSize`, and `hasNextPage`.

Cancellation is shown at the frontend request boundary rather than as a guaranteed cancellation of
the provider request. When the browser request is aborted, the page ignores the result. The backend
provider call remains governed by the configured HTTP client timeouts.