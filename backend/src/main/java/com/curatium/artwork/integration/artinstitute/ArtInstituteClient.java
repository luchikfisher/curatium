package com.curatium.artwork.integration.artinstitute;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.curatium.artwork.application.MuseumArtworkSearchProvider;
import com.curatium.artwork.application.MuseumArtworkSearchResult;
import com.curatium.artwork.application.ArtworkImageUrlFactory;
import com.curatium.artwork.domain.ArtworkSource;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class ArtInstituteClient implements MuseumArtworkSearchProvider {

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

    @Override
    public MuseumArtworkSearchPage search(String query, int page, int pageSize) {
        if (page < 1) {
            throw new IllegalArgumentException("Page must be at least 1.");
        }
        if (pageSize < 1 || pageSize > 20) {
            throw new IllegalArgumentException("Page size must be between 1 and 20.");
        }

        ArtInstituteSearchResponse response;
        try {
            response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/artworks/search")
                            .queryParam("q", query)
                            .queryParam("page", page)
                            .queryParam("limit", pageSize)
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

    public MuseumArtworkSearchResult getArtwork(String externalId) {
        if (isBlank(externalId)) {
            throw new IllegalArgumentException("Artwork identifier must not be blank.");
        }

        ArtInstituteArtworkDetailResponse response;
        try {
            response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/artworks/{artworkId}")
                            .queryParam("fields", FIELDS)
                            .build(externalId.trim()))
                    .retrieve()
                    .body(ArtInstituteArtworkDetailResponse.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) {
                throw new ArtInstituteArtworkNotFoundException(externalId.trim());
            }
            throw new ArtInstituteIntegrationException(
                    "The Art Institute of Chicago service is unavailable.",
                    exception
            );
        } catch (RestClientException exception) {
            throw new ArtInstituteIntegrationException(
                    "The Art Institute of Chicago service is unavailable.",
                    exception
            );
        }

        if (response == null || response.data() == null || response.config() == null
                || isBlank(response.config().website_url())
                || response.data().id() == null || isBlank(response.data().title())) {
            throw new ArtInstituteIntegrationException(
                    "The Art Institute of Chicago returned an unusable response."
            );
        }

        return toSearchResult(response.data(), response.config());
    }

    private MuseumArtworkSearchPage mapSearchResponse(ArtInstituteSearchResponse response) {
        if (response == null || response.data() == null || response.pagination() == null
                || response.config() == null || isBlank(response.config().website_url())) {
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
                && ArtworkImageUrlFactory.isCanonicalImageId(artwork.image_id());
    }

    private MuseumArtworkSearchResult toSearchResult(
            ArtInstituteArtworkResponse artwork,
            ArtInstituteConfigurationResponse configuration
    ) {
        String imageId = artwork.image_id();
        boolean hasUsableImage = ArtworkImageUrlFactory.isCanonicalImageId(imageId);
        return new MuseumArtworkSearchResult(
                ArtworkSource.ART_INSTITUTE_OF_CHICAGO,
                artwork.id().toString(),
                artwork.title(),
                artwork.artist_display(),
                artwork.date_display(),
                artwork.medium_display(),
                hasUsableImage ? ArtworkImageUrlFactory.thumbnailUrl(imageId) : null,
                hasUsableImage ? ArtworkImageUrlFactory.displayUrl(imageId) : null,
                sourceUrl(configuration.website_url(), artwork.id()),
                artwork.credit_line(),
                Boolean.TRUE.equals(artwork.is_public_domain())
        );
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
