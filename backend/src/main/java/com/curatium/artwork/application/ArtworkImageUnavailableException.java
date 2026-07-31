package com.curatium.artwork.application;

public class ArtworkImageUnavailableException extends RuntimeException {

    public ArtworkImageUnavailableException(String message) {
        super(message);
    }

    public ArtworkImageUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
