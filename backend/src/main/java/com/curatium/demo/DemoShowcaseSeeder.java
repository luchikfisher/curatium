package com.curatium.demo;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import com.curatium.artwork.application.ArtworkImageUrlFactory;
import com.curatium.artwork.application.ArtworkImageVariant;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the intentionally named local showcase only when both {@code local} and {@code demo}
 * profiles are active. It persists fixed public-domain snapshots and never contacts the museum
 * provider.
 */
@Component
@Profile("local & demo")
@Transactional
public class DemoShowcaseSeeder implements ApplicationRunner {

    public static final String EXHIBITION_TITLE = "Curatium Demo — Light, Line, and Water";
    private static final String SEED_KEY = "curatium-showcase-v1";
    private static final String SUMMARY = "Four public-domain works in a compact study of reflection, mark-making, and looking.";
    private static final String INTRODUCTION = "This opt-in showcase is designed for a complete Curatium tour: begin with a painted self-portrait, move through two landscapes, and finish with a portrait made for the studio.";
    private static final Instant PUBLISHED_AT = Instant.parse("2025-01-15T12:00:00Z");
    private static final String SOURCE = "ART_INSTITUTE_OF_CHICAGO";
    private static final List<DemoArtwork> ARTWORKS = List.of(
            new DemoArtwork(
                    "80607",
                    "Self-Portrait",
                    "Vincent van Gogh (Dutch, 1853–1890)",
                    "1887",
                    "Oil on artist's board, mounted on cradled panel",
                    "Joseph Winterbotham Collection",
                    "47c5bcb8-62ef-e5d7-55e7-f5121f409a30",
                    "A direct encounter opens the tour: a compact portrait that rewards a close first view.",
                    "self-portrait"
            ),
            new DemoArtwork(
                    "202357",
                    "Landscape",
                    "Georges Seurat\nFrench, 1859–1891",
                    "c. 1881",
                    "Black Conté crayon on off-white laid paper",
                    "Gift of Richard and Mary L. Gray",
                    "3ccdfe37-97e5-4849-2ee9-aef8e7e27595",
                    "Seurat's dense Conté marks make atmosphere from a deliberately limited range of light and dark.",
                    "landscape"
            ),
            new DemoArtwork(
                    "879",
                    "Landscape (The Lock)",
                    "Attributed to John Constable (English, 1776–1837)",
                    "c. 1820–25",
                    "Oil on canvas",
                    "Henry Field Memorial Collection",
                    "ff3b5c8a-5b14-5c35-8775-3d021e92a381",
                    "The wider canvas shifts the gallery rhythm, offering water and sky as an extended horizontal pause.",
                    "landscape-the-lock"
            ),
            new DemoArtwork(
                    "61741",
                    "Portrait of an Artist",
                    "Artist unknown (French, active 18th century)",
                    "c. 1735",
                    "Oil on canvas",
                    "Purchased with funds provided by Mrs. Harold T. Martin in honor of Patrice Marandel",
                    "360e3e61-bb1c-1eb5-a9f5-e620f305b75b",
                    "The final portrait returns the exhibition to the act of making, with palette and easel held in view.",
                    "portrait-of-an-artist"
            )
    );

    private final JdbcTemplate jdbcTemplate;

    public DemoShowcaseSeeder(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed();
    }

    public void seed() {
        jdbcTemplate.execute("SELECT pg_advisory_xact_lock(20260731)");
        long exhibitionId = findOrCreateOwnedExhibition();
        List<Long> artworkIds = new ArrayList<>();
        for (DemoArtwork artwork : ARTWORKS) {
            artworkIds.add(persistOrReuseArtwork(artwork));
        }

        jdbcTemplate.update("""
                UPDATE exhibitions
                SET title = ?, summary = ?, introduction = ?, status = 'PUBLISHED', cover_artwork_id = NULL,
                    updated_at = ?, published_at = ?
                WHERE id = ?
                """, EXHIBITION_TITLE, SUMMARY, INTRODUCTION, timestamp(), timestamp(), exhibitionId);
        jdbcTemplate.update("DELETE FROM exhibition_items WHERE exhibition_id = ?", exhibitionId);

        for (int index = 0; index < ARTWORKS.size(); index++) {
            jdbcTemplate.update("""
                    INSERT INTO exhibition_items (exhibition_id, artwork_id, position, curatorial_note)
                    VALUES (?, ?, ?, ?)
                    """, exhibitionId, artworkIds.get(index), index + 1, ARTWORKS.get(index).curatorialNote());
        }

        jdbcTemplate.update("UPDATE exhibitions SET cover_artwork_id = ? WHERE id = ?", artworkIds.getFirst(), exhibitionId);
    }

    private long findOrCreateOwnedExhibition() {
        List<Long> ownedExhibitionIds = jdbcTemplate.queryForList(
                "SELECT exhibition_id FROM demo_showcase_seeds WHERE seed_key = ?",
                Long.class,
                SEED_KEY
        );
        if (!ownedExhibitionIds.isEmpty()) {
            return ownedExhibitionIds.getFirst();
        }

        long exhibitionId = jdbcTemplate.queryForObject("""
                INSERT INTO exhibitions (
                    title, summary, introduction, status, cover_artwork_id, created_at, updated_at, published_at
                ) VALUES (?, ?, ?, 'PUBLISHED', NULL, ?, ?, ?)
                RETURNING id
                """, Long.class, EXHIBITION_TITLE, SUMMARY, INTRODUCTION, timestamp(), timestamp(), timestamp());
        jdbcTemplate.update(
                "INSERT INTO demo_showcase_seeds (seed_key, exhibition_id) VALUES (?, ?)",
                SEED_KEY,
                exhibitionId
        );
        return exhibitionId;
    }

    private long persistOrReuseArtwork(DemoArtwork artwork) {
        int inserted = jdbcTemplate.update("""
                INSERT INTO artworks (
                    source, external_id, title, artist_display, date_display, medium_display,
                    thumbnail_url, image_url, source_url, credit_line, public_domain
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
                ON CONFLICT (source, external_id) DO NOTHING
                """,
                SOURCE,
                artwork.externalId(),
                artwork.title(),
                artwork.artistDisplay(),
                artwork.dateDisplay(),
                artwork.mediumDisplay(),
                imageUrl(artwork.imageId(), ArtworkImageVariant.THUMBNAIL),
                imageUrl(artwork.imageId(), ArtworkImageVariant.DISPLAY),
                "https://www.artic.edu/artworks/%s/%s".formatted(artwork.externalId(), artwork.slug()),
                artwork.creditLine()
        );
        long artworkId = jdbcTemplate.queryForObject(
                "SELECT id FROM artworks WHERE source = ? AND external_id = ?",
                Long.class,
                SOURCE,
                artwork.externalId()
        );
        if (inserted == 1) {
            jdbcTemplate.update(
                    "INSERT INTO demo_showcase_seed_artworks (seed_key, artwork_id) VALUES (?, ?)",
                    SEED_KEY,
                    artworkId
            );
        }
        if (isOwnedArtwork(artworkId)) {
            refreshOwnedArtwork(artworkId, artwork);
        }
        return artworkId;
    }

    private boolean isOwnedArtwork(long artworkId) {
        Boolean owned = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM demo_showcase_seed_artworks WHERE seed_key = ? AND artwork_id = ?
                )
                """, Boolean.class, SEED_KEY, artworkId);
        return Boolean.TRUE.equals(owned);
    }

    private void refreshOwnedArtwork(long artworkId, DemoArtwork artwork) {
        jdbcTemplate.update("""
                UPDATE artworks
                SET title = ?, artist_display = ?, date_display = ?, medium_display = ?, thumbnail_url = ?,
                    image_url = ?, source_url = ?, credit_line = ?, public_domain = true
                WHERE id = ?
                """,
                artwork.title(),
                artwork.artistDisplay(),
                artwork.dateDisplay(),
                artwork.mediumDisplay(),
                imageUrl(artwork.imageId(), ArtworkImageVariant.THUMBNAIL),
                imageUrl(artwork.imageId(), ArtworkImageVariant.DISPLAY),
                "https://www.artic.edu/artworks/%s/%s".formatted(artwork.externalId(), artwork.slug()),
                artwork.creditLine(),
                artworkId
        );
    }

    private Timestamp timestamp() {
        return Timestamp.from(PUBLISHED_AT);
    }

    private String imageUrl(String imageId, ArtworkImageVariant variant) {
        return ArtworkImageUrlFactory.url(ArtworkImageUrlFactory.parseCanonicalImageId(imageId), variant);
    }

    private record DemoArtwork(
            String externalId,
            String title,
            String artistDisplay,
            String dateDisplay,
            String mediumDisplay,
            String creditLine,
            String imageId,
            String curatorialNote,
            String slug
    ) {
    }
}
