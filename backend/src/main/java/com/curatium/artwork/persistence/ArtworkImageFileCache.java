package com.curatium.artwork.persistence;

import com.curatium.artwork.application.ArtworkImageUnavailableException;
import com.curatium.artwork.application.ArtworkImageValidator;
import com.curatium.artwork.application.ArtworkImageVariant;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Stores validated read-through image responses for the trusted local academic deployment.
 *
 * <p>Cache eviction and capacity management are intentionally deferred: this application is
 * demonstrated locally and does not operate a shared, unbounded public image service.</p>
 */
@Component
public class ArtworkImageFileCache {

    private final Path cacheDirectory;

    public ArtworkImageFileCache(
            @Value("${curatium.art-institute.image-cache-directory:./.curatium/artwork-images}") String cacheDirectory
    ) {
        this.cacheDirectory = Path.of(cacheDirectory).toAbsolutePath().normalize();
    }

    public Optional<CachedArtworkImage> find(UUID imageId, ArtworkImageVariant variant) {
        Path path = pathFor(imageId, variant);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            Optional<byte[]> cachedBytes = readBounded(path);
            if (cachedBytes.isEmpty() || !ArtworkImageValidator.isValidJpeg(cachedBytes.get())) {
                return invalidate(path);
            }
            return Optional.of(new CachedArtworkImage(cachedBytes.get(), Files.getLastModifiedTime(path).toInstant()));
        } catch (IOException exception) {
            throw new ArtworkImageUnavailableException("The local artwork image cache could not be read.", exception);
        }
    }

    public CachedArtworkImage write(UUID imageId, ArtworkImageVariant variant, byte[] bytes) {
        Path target = pathFor(imageId, variant);
        Path parent = target.getParent();
        try {
            Files.createDirectories(parent);
            Path temporary = Files.createTempFile(parent, target.getFileName().toString(), ".tmp");
            try {
                Files.write(temporary, bytes);
                moveAtomically(temporary, target);
            } finally {
                Files.deleteIfExists(temporary);
            }
            return new CachedArtworkImage(bytes, Files.getLastModifiedTime(target).toInstant());
        } catch (IOException exception) {
            throw new ArtworkImageUnavailableException("The local artwork image cache could not be written.", exception);
        }
    }

    private Path pathFor(UUID imageId, ArtworkImageVariant variant) {
        return cacheDirectory.resolve(imageId.toString()).resolve(variant.pathValue() + ".jpg");
    }

    private Optional<byte[]> readBounded(Path path) throws IOException {
        try (InputStream input = Files.newInputStream(path); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > ArtworkImageValidator.MAXIMUM_IMAGE_BYTES) {
                    return Optional.empty();
                }
                output.write(buffer, 0, read);
            }
            return Optional.of(output.toByteArray());
        }
    }

    private Optional<CachedArtworkImage> invalidate(Path path) throws IOException {
        Files.deleteIfExists(path);
        return Optional.empty();
    }

    private void moveAtomically(Path temporary, Path target) throws IOException {
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    public record CachedArtworkImage(byte[] bytes, Instant lastModified) {
    }
}
