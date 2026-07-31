package com.curatium.artwork.application;

import com.curatium.artwork.integration.artinstitute.ArtInstituteImageClient;
import com.curatium.artwork.integration.artinstitute.FetchedArtworkImage;
import com.curatium.artwork.persistence.ArtworkImageFileCache;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ArtworkImageService {

    private final PackagedDemoArtworkImages packagedDemoArtworkImages;
    private final ArtworkImageFileCache fileCache;
    private final ArtInstituteImageClient imageClient;
    private final ConcurrentHashMap<ImageCacheKey, CompletableFuture<DeliveredArtworkImage>> inFlight = new ConcurrentHashMap<>();

    public ArtworkImageService(
            PackagedDemoArtworkImages packagedDemoArtworkImages,
            ArtworkImageFileCache fileCache,
            ArtInstituteImageClient imageClient
    ) {
        this.packagedDemoArtworkImages = packagedDemoArtworkImages;
        this.fileCache = fileCache;
        this.imageClient = imageClient;
    }

    public DeliveredArtworkImage image(String requestedImageId, String requestedVariant) {
        UUID imageId = ArtworkImageUrlFactory.parseCanonicalImageId(requestedImageId);
        ArtworkImageVariant variant = ArtworkImageVariant.fromPathValue(requestedVariant);
        if (ArtworkImageUrlFactory.UNAVAILABLE_IMAGE_ID.equals(imageId)) {
            throw new ArtworkImageNotFoundException();
        }

        return packagedDemoArtworkImages.find(imageId, variant)
                .or(() -> fileCache.find(imageId, variant).map(this::toDelivered))
                .orElseGet(() -> fetchOnce(imageId, variant));
    }

    private DeliveredArtworkImage fetchOnce(UUID imageId, ArtworkImageVariant variant) {
        ImageCacheKey key = new ImageCacheKey(imageId, variant);
        CompletableFuture<DeliveredArtworkImage> future = inFlight.computeIfAbsent(
                key,
                ignored -> CompletableFuture.supplyAsync(() -> fetchAndCache(imageId, variant))
        );
        try {
            return future.join();
        } catch (CompletionException exception) {
            if (exception.getCause() instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw exception;
        } finally {
            inFlight.remove(key, future);
        }
    }

    private DeliveredArtworkImage fetchAndCache(UUID imageId, ArtworkImageVariant variant) {
        FetchedArtworkImage fetched = imageClient.fetch(imageId, variant);
        return toDelivered(fileCache.write(imageId, variant, fetched.bytes()));
    }

    private DeliveredArtworkImage toDelivered(ArtworkImageFileCache.CachedArtworkImage cached) {
        return new DeliveredArtworkImage(cached.bytes(), eTagFor(cached.bytes()), cached.lastModified());
    }

    static String eTagFor(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return "\"" + HexFormat.of().formatHex(digest) + "\"";
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private record ImageCacheKey(UUID imageId, ArtworkImageVariant variant) {
    }
}
