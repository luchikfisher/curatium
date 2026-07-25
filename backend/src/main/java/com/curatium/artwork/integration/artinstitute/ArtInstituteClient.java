package com.curatium.artwork.integration.artinstitute;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.curatium.artwork.application.MuseumArtworkSearchResult;
import com.curatium.artwork.domain.ArtworkSource;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class ArtInstituteClient {

    private static final int PAGE_SIZE = 20;
    private static final String FIELDS = String.join(",",
            "id",
            "title",
            "artist_display",
            "date_display",
            "medium_display",
            "image_id",
            "credit_line",
            "is_public_domain"
    );

    private final RestClient restClient;

    public ArtInstituteClient(RestClient artInstituteRestClient) {
        this.restClient = artInstituteRestClient;
    }

    public MuseumArtworkSearchPage search(String query, int page) {
        String normalizedQuery = normalizeQuery(query);
        if (page < 1) {
            throw new IllegalArgumentException("Page must be at least 1.");
        }

        ArtInstituteSearchResponse response;
        try {
            response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/artworks/search")
                            .queryParam("q", normalizedQuery)
                            .queryParam("page", page)
                            .queryParam("limit", PAGE_SIZE)
                            .queryParam("fields", FIELDS)
                            .build())
                    .retrieve()
                    .body(ArtInstituteSearchResponse.class);
        } catch (RestClientException exception) {
            throw new ArtInstituteIntegrationException(
                    "The Art Institute of Chicago service is unavailable.",
                    exception
            );
        }

        return mapSearchResponse(response);
    }

    private MuseumArtworkSearchPage mapSearchResponse(ArtInstituteSearchResponse response) {
        if (response == null || response.data() == null || response.pagination() == null
                || response.config() == null || isBlank(response.config().iiif_url())
                || isBlank(response.config().website_url())) {
            throw new ArtInstituteIntegrationException(
                    "The Art Institute of Chicago returned an unusable response."
            );
        }

        List<MuseumArtworkSearchResult> items = response.data().stream()
                .filter(this::isUsablePublicArtwork)
                .map(artwork -> toSearchResult(artwork, response.config()))
                .toList();
        ArtInstitutePaginationResponse pagination = response.pagination();

        return new MuseumArtworkSearchPage(
                items,
                pagination.current_page(),
                pagination.limit(),
                !isBlank(pagination.next_url())
        );
    }

    private boolean isUsablePublicArtwork(ArtInstituteArtworkResponse artwork) {
        return artwork.id() != null
                && !isBlank(artwork.title())
                && Boolean.TRUE.equals(artwork.is_public_domain())
                && !isBlank(artwork.image_id());
    }

    private MuseumArtworkSearchResult toSearchResult(
            ArtInstituteArtworkResponse artwork,
            ArtInstituteConfigurationResponse configuration
    ) {
        return new MuseumArtworkSearchResult(
                ArtworkSource.ART_INSTITUTE_OF_CHICAGO,
                artwork.id().toString(),
                artwork.title(),
                artwork.artist_display(),
                artwork.date_display(),
                artwork.medium_display(),
                iiifImageUrl(configuration.iiif_url(), artwork.image_id(), 200),
                iiifImageUrl(configuration.iiif_url(), artwork.image_id(), 843),
                sourceUrl(configuration.website_url(), artwork.id()),
                artwork.credit_line(),
                true
        );
    }

    private String normalizeQuery(String query) {
        if (isBlank(query)) {
            throw new IllegalArgumentException("Search query must not be blank.");
        }
        return query.trim();
    }

    private String iiifImageUrl(String iiifBaseUrl, String imageId, int width) {
        return stripTrailingSlash(iiifBaseUrl)
                + "/" + imageId + "/full/" + width + ",/0/default.jpg";
    }

    private String sourceUrl(String websiteUrl, long artworkId) {
        String normalizedWebsiteUrl = stripTrailingSlash(websiteUrl);
        if (normalizedWebsiteUrl.startsWith("http://")) {
            normalizedWebsiteUrl = "https://" + normalizedWebsiteUrl.substring("http://".length());
        }
        return normalizedWebsiteUrl + "/artworks/" + artworkId;
    }

    private String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
