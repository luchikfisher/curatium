package com.curatium.artwork.application;

import com.curatium.artwork.integration.cleveland.ClevelandMuseumImageClient;
import com.curatium.artwork.persistence.ArtworkImageFileCache;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ClevelandArtworkImageService {

    private final ArtworkImageFileCache fileCache;
    private final ClevelandMuseumImageClient imageClient;
    private final ConcurrentHashMap<ImageCacheKey, CompletableFuture<DeliveredArtworkImage>> inFlight = new ConcurrentHashMap<>();

    public ClevelandArtworkImageService(
            ArtworkImageFileCache fileCache,
            ClevelandMuseumImageClient imageClient
    ) {
        this.fileCache = fileCache;
        this.imageClient = imageClient;
    }

    public DeliveredArtworkImage image(String requestedAccessionNumber, String requestedVariant) {
        String accessionNumber = ClevelandArtworkImageUrlFactory.parseCanonicalAccessionNumber(requestedAccessionNumber);
        ArtworkImageVariant variant = ArtworkImageVariant.fromPathValue(requestedVariant);

        return fileCache.findCleveland(accessionNumber, variant)
                .map(this::toDelivered)
                .orElseGet(() -> fetchOnce(accessionNumber, variant));
    }

    private DeliveredArtworkImage fetchOnce(String accessionNumber, ArtworkImageVariant variant) {
        ImageCacheKey key = new ImageCacheKey(accessionNumber, variant);
        CompletableFuture<DeliveredArtworkImage> future = inFlight.computeIfAbsent(
                key,
                ignored -> CompletableFuture.supplyAsync(() -> fetchAndCache(accessionNumber, variant))
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

    private DeliveredArtworkImage fetchAndCache(String accessionNumber, ArtworkImageVariant variant) {
        ClevelandMuseumImageClient.FetchedClevelandArtworkImage fetched = imageClient.fetch(accessionNumber);
        return toDelivered(fileCache.writeCleveland(accessionNumber, variant, fetched.bytes()));
    }

    private DeliveredArtworkImage toDelivered(ArtworkImageFileCache.CachedArtworkImage cached) {
        return new DeliveredArtworkImage(
                cached.bytes(),
                ArtworkImageService.eTagFor(cached.bytes()),
                cached.lastModified()
        );
    }

    private record ImageCacheKey(String accessionNumber, ArtworkImageVariant variant) {
    }
}
