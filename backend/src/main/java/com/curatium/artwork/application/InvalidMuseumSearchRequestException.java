package com.curatium.artwork.application;

public class InvalidMuseumSearchRequestException extends RuntimeException {

    private final String field;

    public InvalidMuseumSearchRequestException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
