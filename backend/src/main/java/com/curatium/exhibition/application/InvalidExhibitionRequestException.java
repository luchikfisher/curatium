package com.curatium.exhibition.application;

public class InvalidExhibitionRequestException extends RuntimeException {

    private final String field;

    public InvalidExhibitionRequestException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
