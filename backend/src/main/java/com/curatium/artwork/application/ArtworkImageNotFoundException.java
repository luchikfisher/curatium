package com.curatium.artwork.application;

public class ArtworkImageNotFoundException extends RuntimeException {

    public ArtworkImageNotFoundException() {
        super("The requested artwork image is not available.");
    }
}
