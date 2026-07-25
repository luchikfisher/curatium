package com.curatium.exhibition.application;

public class InvalidPublicationStateException extends RuntimeException {

    public InvalidPublicationStateException(String message) {
        super(message);
    }
}
