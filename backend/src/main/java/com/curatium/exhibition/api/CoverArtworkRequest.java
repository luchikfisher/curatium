package com.curatium.exhibition.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CoverArtworkRequest(
        @NotNull(message = "Artwork ID is required.")
        @Positive(message = "Artwork ID must be positive.")
        Long artworkId
) {
}
