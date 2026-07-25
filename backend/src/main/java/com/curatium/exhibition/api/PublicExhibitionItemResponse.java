package com.curatium.exhibition.api;

public record PublicExhibitionItemResponse(
        Long id,
        int position,
        String curatorialNote,
        PublicExhibitionArtworkResponse artwork
) {
}
