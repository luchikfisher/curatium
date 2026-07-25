package com.curatium.exhibition.application;

public class InvalidCoverArtworkException extends RuntimeException {

    public InvalidCoverArtworkException(long exhibitionId) {
        super("The selected artwork is not included in exhibition %d.".formatted(exhibitionId));
    }
}
