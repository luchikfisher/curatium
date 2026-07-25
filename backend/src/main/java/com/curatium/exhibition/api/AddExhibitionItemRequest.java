package com.curatium.exhibition.api;

import com.curatium.artwork.domain.ArtworkSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AddExhibitionItemRequest(
        @NotNull ArtworkSource source,
        @NotBlank @Size(max = 100) String externalId
) {
}
