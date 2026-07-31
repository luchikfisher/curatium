package com.curatium.artwork.integration;

public class MuseumProviderIntegrationException extends RuntimeException {

    public MuseumProviderIntegrationException(String message) {
        super(message);
    }

    public MuseumProviderIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
