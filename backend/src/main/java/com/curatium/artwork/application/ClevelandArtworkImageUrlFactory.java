package com.curatium.artwork.application;

import com.curatium.artwork.integration.cleveland.ClevelandAccessionNumber;

public final class ClevelandArtworkImageUrlFactory {

    private static final String PATH_PREFIX = "/api/artwork-images/cleveland/";

    private ClevelandArtworkImageUrlFactory() {
    }

    public static String url(String accessionNumber, ArtworkImageVariant variant) {
        return PATH_PREFIX + parseCanonicalAccessionNumber(accessionNumber) + "/" + variant.pathValue();
    }

    public static String thumbnailUrl(String accessionNumber) {
        return url(accessionNumber, ArtworkImageVariant.THUMBNAIL);
    }

    public static String displayUrl(String accessionNumber) {
        return url(accessionNumber, ArtworkImageVariant.DISPLAY);
    }

    public static String parseCanonicalAccessionNumber(String value) {
        if (!ClevelandAccessionNumber.isCanonical(value)) {
            throw new InvalidArtworkImageRequestException(
                    "Cleveland artwork accession number is invalid."
            );
        }
        return value;
    }
}
