package com.curatium.exhibition.api;

public record ExhibitionItemResponse(
        Long id,
        ExhibitionArtworkResponse artwork,
        int position,
        String curatorialNote
) {
}
