package com.curatium.exhibition.application;

public class ExhibitionItemNotFoundException extends RuntimeException {

    public ExhibitionItemNotFoundException(long itemId) {
        super("Exhibition item %d was not found.".formatted(itemId));
    }
}
