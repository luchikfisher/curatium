package com.curatium.artwork.application;

import java.util.UUID;

public final class ArtworkImageUrlFactory {

    public static final UUID UNAVAILABLE_IMAGE_ID = UUID.fromString("00000000-0000-0000-0000-000000000000");
    private static final String PATH_PREFIX = "/api/artwork-images/art-institute/";

    private ArtworkImageUrlFactory() {
    }

    public static String url(UUID imageId, ArtworkImageVariant variant) {
        return PATH_PREFIX + imageId + "/" + variant.pathValue();
    }

    public static String thumbnailUrl(String imageId) {
        return url(parseCanonicalImageId(imageId), ArtworkImageVariant.THUMBNAIL);
    }

    public static String displayUrl(String imageId) {
        return url(parseCanonicalImageId(imageId), ArtworkImageVariant.DISPLAY);
    }

    public static String unavailableUrl(ArtworkImageVariant variant) {
        return url(UNAVAILABLE_IMAGE_ID, variant);
    }

    public static boolean isCanonicalImageId(String value) {
        try {
            parseCanonicalImageId(value);
            return true;
        } catch (InvalidArtworkImageRequestException exception) {
            return false;
        }
    }

    public static UUID parseCanonicalImageId(String value) {
        if (value == null || !value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            throw new InvalidArtworkImageRequestException("Artwork image identifier must be a canonical lowercase UUID.");
        }
        return UUID.fromString(value);
    }
}
