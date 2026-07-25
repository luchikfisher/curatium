package com.curatium.exhibition.api;

import com.curatium.artwork.domain.ArtworkSource;

public record ExhibitionArtworkResponse(
        Long id,
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
