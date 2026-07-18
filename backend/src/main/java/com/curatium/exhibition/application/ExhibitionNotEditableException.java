package com.curatium.exhibition.application;

public class ExhibitionNotEditableException extends RuntimeException {

    public ExhibitionNotEditableException(long exhibitionId) {
        super("Exhibition %d must be unpublished before it can be edited.".formatted(exhibitionId));
    }
}
