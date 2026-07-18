package com.curatium.exhibition.application;

public class ExhibitionNotFoundException extends RuntimeException {

    public ExhibitionNotFoundException(long exhibitionId) {
        super("Exhibition %d was not found.".formatted(exhibitionId));
    }
}
