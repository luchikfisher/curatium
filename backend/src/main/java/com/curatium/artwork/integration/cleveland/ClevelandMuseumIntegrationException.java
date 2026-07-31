package com.curatium.artwork.integration.cleveland;

import com.curatium.artwork.integration.MuseumProviderIntegrationException;

public class ClevelandMuseumIntegrationException extends MuseumProviderIntegrationException {

    public ClevelandMuseumIntegrationException(String message) {
        super(message);
    }

    public ClevelandMuseumIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
