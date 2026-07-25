package com.curatium.artwork.integration.artinstitute;

public class ArtInstituteArtworkNotFoundException extends RuntimeException {

    public ArtInstituteArtworkNotFoundException(String externalId) {
        super("Artwork " + externalId + " was not found by the Art Institute of Chicago.");
    }
}
