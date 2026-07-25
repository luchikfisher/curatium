package com.curatium.exhibition.application;

public class DuplicateExhibitionArtworkException extends RuntimeException {

    public DuplicateExhibitionArtworkException(long exhibitionId) {
        super("The artwork is already in exhibition " + exhibitionId + ".");
    }
}
