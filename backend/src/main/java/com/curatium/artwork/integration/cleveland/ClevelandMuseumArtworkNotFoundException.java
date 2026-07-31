package com.curatium.artwork.integration.cleveland;

public class ClevelandMuseumArtworkNotFoundException extends RuntimeException {

    public ClevelandMuseumArtworkNotFoundException(String accessionNumber) {
        super("Cleveland Museum of Art artwork was not found: " + accessionNumber);
    }
}
