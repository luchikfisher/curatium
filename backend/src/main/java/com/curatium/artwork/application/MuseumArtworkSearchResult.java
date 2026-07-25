package com.curatium.artwork.application;

import com.curatium.artwork.domain.ArtworkSource;

public record MuseumArtworkSearchResult(
        ArtworkSource source,
        String externalId,
        String title,
        String artistDisplay,
        String dateDisplay,
        String mediumDisplay,
        String thumbnailUrl,
        String imageUrl,
        String sourceUrl,
        String creditLine,
        boolean publicDomain
) {
}
