package com.curatium.artwork.application;

public class InvalidArtworkImageRequestException extends RuntimeException {

    public InvalidArtworkImageRequestException(String message) {
        super(message);
    }
}
