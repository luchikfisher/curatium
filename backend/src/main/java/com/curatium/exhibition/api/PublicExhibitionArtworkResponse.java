package com.curatium.exhibition.api;

public record PublicExhibitionArtworkResponse(
        Long id,
        String title,
        String artistDisplay,
        String dateDisplay,
        String mediumDisplay,
        String imageUrl,
        String sourceUrl,
        String creditLine
) {
}
