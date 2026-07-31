package com.curatium.artwork.application;

public enum ArtworkImageVariant {
    THUMBNAIL("thumbnail", 400),
    DISPLAY("display", 843);

    private final String pathValue;
    private final int width;

    ArtworkImageVariant(String pathValue, int width) {
        this.pathValue = pathValue;
        this.width = width;
    }

    public String pathValue() {
        return pathValue;
    }

    public int width() {
        return width;
    }

    public static ArtworkImageVariant fromPathValue(String value) {
        for (ArtworkImageVariant variant : values()) {
            if (variant.pathValue.equals(value)) {
                return variant;
            }
        }
        throw new InvalidArtworkImageRequestException("Artwork image variant must be thumbnail or display.");
    }
}
