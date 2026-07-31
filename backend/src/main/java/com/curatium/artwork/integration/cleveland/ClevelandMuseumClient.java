package com.curatium.artwork.integration.cleveland;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.curatium.artwork.application.MuseumArtworkSearchProvider;
import com.curatium.artwork.application.MuseumArtworkSearchResult;
import com.curatium.artwork.domain.ArtworkSource;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@Primary
public class ClevelandMuseumClient implements MuseumArtworkSearchProvider {

    private static final String CC0_LICENSE = "CC0";

    private final RestClient restClient;

    public ClevelandMuseumClient(@Qualifier("clevelandMuseumRestClient") RestClient clevelandMuseumRestClient) {
        this.restClient = clevelandMuseumRestClient;
    }

    @Override
    public MuseumArtworkSearchPage search(String query, int page, int pageSize) {
        if (page < 1) {
            throw new IllegalArgumentException("Page must be at least 1.");
        }
        if (pageSize < 1 || pageSize > 20) {
            throw new IllegalArgumentException("Page size must be between 1 and 20.");
        }

        ClevelandMuseumSearchResponse response;
        try {
            response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/artworks/")
                            .queryParam("q", query)
                            .queryParam("cc0", 1)
                            .queryParam("has_image", 1)
                            .queryParam("limit", pageSize)
                            .queryParam("skip", (page - 1) * pageSize)
                            .build())
                    .retrieve()
                    .body(ClevelandMuseumSearchResponse.class);
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }

        if (response == null || response.info() == null || response.info().total() == null
                || response.info().total() < 0 || response.data() == null) {
            throw new ClevelandMuseumIntegrationException(
                    "The Cleveland Museum of Art returned an unusable response."
            );
        }

        List<MuseumArtworkSearchResult> items = response.data().stream()
                .filter(Objects::nonNull)
                .filter(this::isUsableCc0Artwork)
                .map(this::toSearchResult)
                .toList();
        long nextOffset = (long) page * pageSize;
        return new MuseumArtworkSearchPage(
                items,
                page,
                pageSize,
                nextOffset < response.info().total()
        );
    }

    private boolean isUsableCc0Artwork(ClevelandMuseumArtworkResponse artwork) {
        return artwork.id() != null
                && ClevelandAccessionNumber.isCanonical(artwork.accession_number())
                && !isBlank(artwork.title())
                && CC0_LICENSE.equals(artwork.share_license_status())
                && artwork.images() != null
                && !isBlank(imageUrl(artwork.images().web()))
                && !isBlank(imageUrl(artwork.images().print()));
    }

    private MuseumArtworkSearchResult toSearchResult(ClevelandMuseumArtworkResponse artwork) {
        return new MuseumArtworkSearchResult(
                ArtworkSource.CLEVELAND_MUSEUM_OF_ART,
                artwork.accession_number(),
                artwork.title(),
                creatorDescription(artwork.creators()),
                blankToNull(artwork.creation_date()),
                mediumDisplay(artwork.technique(), artwork.measurements()),
                null,
                null,
                blankToNull(artwork.url()),
                blankToNull(artwork.creditline()),
                true
        );
    }

    private String creatorDescription(List<ClevelandMuseumCreatorResponse> creators) {
        if (creators == null) {
            return null;
        }
        return creators.stream()
                .filter(Objects::nonNull)
                .map(ClevelandMuseumCreatorResponse::description)
                .filter(description -> !isBlank(description))
                .findFirst()
                .orElse(null);
    }

    private String mediumDisplay(String technique, String measurements) {
        String normalizedTechnique = blankToNull(technique);
        String normalizedMeasurements = blankToNull(measurements);
        if (normalizedTechnique == null) {
            return normalizedMeasurements;
        }
        if (normalizedMeasurements == null) {
            return normalizedTechnique;
        }
        return normalizedTechnique + " — " + normalizedMeasurements;
    }

    private String imageUrl(ClevelandMuseumImageResponse image) {
        return image == null ? null : image.url();
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private ClevelandMuseumIntegrationException unavailable(RestClientException exception) {
        return new ClevelandMuseumIntegrationException(
                "The Cleveland Museum of Art service is unavailable.",
                exception
        );
    }
}
