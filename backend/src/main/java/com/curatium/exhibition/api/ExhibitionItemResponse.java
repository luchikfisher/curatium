package com.curatium.exhibition.api;

public record ExhibitionItemResponse(
        Long id,
        Long artworkId,
        int position,
        String curatorialNote
) {
}
