package com.curatium.artwork.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "artworks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Artwork {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ArtworkSource source;

    @Column(name = "external_id", nullable = false, length = 100)
    private String externalId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(name = "artist_display", length = 1000)
    private String artistDisplay;

    @Column(name = "date_display", length = 255)
    private String dateDisplay;

    @Column(name = "medium_display", length = 1000)
    private String mediumDisplay;

    @Column(name = "thumbnail_url", nullable = false)
    private String thumbnailUrl;

    @Column(name = "image_url", nullable = false)
    private String imageUrl;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "credit_line")
    private String creditLine;

    @Column(name = "public_domain", nullable = false)
    private boolean publicDomain;

    @CreationTimestamp
    @Column(name = "imported_at", nullable = false, updatable = false)
    private Instant importedAt;

    private Artwork(
            ArtworkSource source,
            String externalId,
            String title,
            String artistDisplay,
            String dateDisplay,
            String mediumDisplay,
            String thumbnailUrl,
            String imageUrl,
            String sourceUrl,
            String creditLine,
            boolean publicDomain
    ) {
        this.source = source;
        this.externalId = externalId;
        this.title = title;
        this.artistDisplay = artistDisplay;
        this.dateDisplay = dateDisplay;
        this.mediumDisplay = mediumDisplay;
        this.thumbnailUrl = thumbnailUrl;
        this.imageUrl = imageUrl;
        this.sourceUrl = sourceUrl;
        this.creditLine = creditLine;
        this.publicDomain = publicDomain;
    }

    public static Artwork importSnapshot(
            ArtworkSource source,
            String externalId,
            String title,
            String artistDisplay,
            String dateDisplay,
            String mediumDisplay,
            String thumbnailUrl,
            String imageUrl,
            String sourceUrl,
            String creditLine
    ) {
        return new Artwork(
                source,
                externalId,
                title,
                artistDisplay,
                dateDisplay,
                mediumDisplay,
                thumbnailUrl,
                imageUrl,
                sourceUrl,
                creditLine,
                true
        );
    }
}
