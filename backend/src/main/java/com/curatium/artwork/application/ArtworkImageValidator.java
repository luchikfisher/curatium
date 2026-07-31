package com.curatium.artwork.application;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;

public final class ArtworkImageValidator {

    public static final int MAXIMUM_IMAGE_BYTES = 8 * 1024 * 1024;

    private ArtworkImageValidator() {
    }

    public static boolean isValidJpeg(byte[] bytes) {
        if (!hasJpegSignature(bytes)) {
            return false;
        }
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            return image != null;
        } catch (IOException exception) {
            return false;
        }
    }

    private static boolean hasJpegSignature(byte[] bytes) {
        return bytes.length >= 4
                && (bytes[0] & 0xff) == 0xff
                && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff
                && (bytes[bytes.length - 2] & 0xff) == 0xff
                && (bytes[bytes.length - 1] & 0xff) == 0xd9;
    }
}
