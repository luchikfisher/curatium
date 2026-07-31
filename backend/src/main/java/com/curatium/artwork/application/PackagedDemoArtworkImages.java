package com.curatium.artwork.application;

import java.io.IOException;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class PackagedDemoArtworkImages {

    public Optional<DeliveredArtworkImage> find(UUID imageId, ArtworkImageVariant variant) {
        ClassPathResource resource = new ClassPathResource(
                "demo-artwork-images/" + imageId + "-" + variant.pathValue() + ".jpg"
        );
        if (!resource.exists()) {
            return Optional.empty();
        }
        try {
            byte[] bytes = resource.getContentAsByteArray();
            return Optional.of(new DeliveredArtworkImage(bytes, ArtworkImageService.eTagFor(bytes), Instant.EPOCH));
        } catch (IOException exception) {
            throw new ArtworkImageUnavailableException("A packaged demo artwork image could not be read.", exception);
        }
    }
}
