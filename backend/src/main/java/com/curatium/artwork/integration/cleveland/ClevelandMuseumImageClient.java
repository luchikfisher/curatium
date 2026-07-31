package com.curatium.artwork.integration.cleveland;

import com.curatium.artwork.application.ArtworkImageNotFoundException;
import com.curatium.artwork.application.ArtworkImageUnavailableException;
import com.curatium.artwork.application.ArtworkImageValidator;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ClevelandMuseumImageClient {

    private final HttpClient httpClient;
    private final URI imageBaseUri;
    private final Duration readTimeout;

    public ClevelandMuseumImageClient(
            @Qualifier("clevelandMuseumHttpClient") HttpClient httpClient,
            @Value("${curatium.cleveland-museum.image-base-url}") String imageBaseUrl,
            @Value("${curatium.cleveland-museum.read-timeout}") Duration readTimeout
    ) {
        this.httpClient = httpClient;
        this.imageBaseUri = URI.create(stripTrailingSlash(imageBaseUrl));
        this.readTimeout = readTimeout;
    }

    public FetchedClevelandArtworkImage fetch(String accessionNumber) {
        URI uri = URI.create(imageBaseUri + "/" + accessionNumber + "/" + accessionNumber + "_web.jpg");
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(readTimeout)
                .header("Accept", "image/jpeg")
                .header("User-Agent", "Curatium/1.0")
                .GET()
                .build();

        try {
            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() == 404) {
                    throw new ArtworkImageNotFoundException();
                }
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw unavailable("The artwork image provider is temporarily unavailable.");
                }
                if (!isJpeg(response.headers().firstValue("Content-Type").orElse(""))) {
                    throw unavailable("The artwork image provider returned an invalid image response.");
                }
                long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1);
                if (contentLength > ArtworkImageValidator.MAXIMUM_IMAGE_BYTES) {
                    throw unavailable("The artwork image provider returned an image that is too large.");
                }
                byte[] bytes = readBounded(body);
                if (!ArtworkImageValidator.isValidJpeg(bytes)) {
                    throw unavailable("The artwork image provider returned an invalid image response.");
                }
                return new FetchedClevelandArtworkImage(bytes);
            }
        } catch (ArtworkImageNotFoundException | ArtworkImageUnavailableException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable("The artwork image provider is temporarily unavailable.", exception);
        } catch (IOException exception) {
            throw unavailable("The artwork image provider is temporarily unavailable.", exception);
        }
    }

    private byte[] readBounded(InputStream body) throws IOException {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = body.read(buffer)) != -1) {
                total += read;
                if (total > ArtworkImageValidator.MAXIMUM_IMAGE_BYTES) {
                    throw unavailable("The artwork image provider returned an image that is too large.");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private boolean isJpeg(String contentType) {
        return "image/jpeg".equals(contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT));
    }

    private ArtworkImageUnavailableException unavailable(String message) {
        return new ArtworkImageUnavailableException(message);
    }

    private ArtworkImageUnavailableException unavailable(String message, Throwable cause) {
        return new ArtworkImageUnavailableException(message, cause);
    }

    private String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public record FetchedClevelandArtworkImage(byte[] bytes) {
    }
}
