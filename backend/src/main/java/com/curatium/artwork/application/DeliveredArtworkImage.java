package com.curatium.artwork.application;

import java.time.Instant;

public record DeliveredArtworkImage(
        byte[] bytes,
        String eTag,
        Instant lastModified
) {
}
