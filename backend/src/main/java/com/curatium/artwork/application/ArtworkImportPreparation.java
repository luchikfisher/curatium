package com.curatium.artwork.application;

import com.curatium.artwork.domain.ArtworkSource;

public record ArtworkImportPreparation(
        ArtworkSource source,
        String externalId,
        ValidatedArtworkSnapshot validatedSnapshot
) {
}
