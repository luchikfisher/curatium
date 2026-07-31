package com.curatium.artwork.integration.artinstitute;

import com.curatium.artwork.integration.MuseumProviderIntegrationException;

public class ArtInstituteIntegrationException extends MuseumProviderIntegrationException {

    public ArtInstituteIntegrationException(String message) {
        super(message);
    }

    public ArtInstituteIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
