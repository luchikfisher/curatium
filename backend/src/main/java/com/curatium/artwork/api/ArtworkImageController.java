package com.curatium.artwork.api;

import com.curatium.artwork.application.ArtworkImageService;
import com.curatium.artwork.application.DeliveredArtworkImage;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/artwork-images/art-institute")
@RequiredArgsConstructor
public class ArtworkImageController {

    private static final CacheControl CACHE_CONTROL = CacheControl.maxAge(Duration.ofDays(1)).cachePublic();

    private final ArtworkImageService artworkImageService;

    @GetMapping(value = "/{imageId}/{variant}", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<byte[]> getArtworkImage(
            @PathVariable String imageId,
            @PathVariable String variant,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch
    ) {
        DeliveredArtworkImage image = artworkImageService.image(imageId, variant);
        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .contentLength(image.bytes().length)
                .eTag(image.eTag())
                .lastModified(image.lastModified().toEpochMilli())
                .cacheControl(CACHE_CONTROL);
        if (matches(ifNoneMatch, image.eTag())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(image.eTag())
                    .lastModified(image.lastModified().toEpochMilli())
                    .cacheControl(CACHE_CONTROL)
                    .build();
        }
        return response.body(image.bytes());
    }

    private boolean matches(String ifNoneMatch, String eTag) {
        return ifNoneMatch != null && (ifNoneMatch.equals("*") || ifNoneMatch.contains(eTag));
    }
}
