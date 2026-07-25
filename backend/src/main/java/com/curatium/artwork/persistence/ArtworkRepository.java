package com.curatium.artwork.persistence;

import com.curatium.artwork.domain.Artwork;
import com.curatium.artwork.domain.ArtworkSource;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ArtworkRepository extends JpaRepository<Artwork, Long> {

    Optional<Artwork> findBySourceAndExternalId(ArtworkSource source, String externalId);

    @Modifying
    @Query(value = """
            INSERT INTO artworks (
                source, external_id, title, artist_display, date_display, medium_display,
                thumbnail_url, image_url, source_url, credit_line, public_domain
            ) VALUES (
                :source, :externalId, :title, :artistDisplay, :dateDisplay, :mediumDisplay,
                :thumbnailUrl, :imageUrl, :sourceUrl, :creditLine, true
            ) ON CONFLICT (source, external_id) DO NOTHING
            """, nativeQuery = true)
    int insertSnapshotIfAbsent(
            @Param("source") String source,
            @Param("externalId") String externalId,
            @Param("title") String title,
            @Param("artistDisplay") String artistDisplay,
            @Param("dateDisplay") String dateDisplay,
            @Param("mediumDisplay") String mediumDisplay,
            @Param("thumbnailUrl") String thumbnailUrl,
            @Param("imageUrl") String imageUrl,
            @Param("sourceUrl") String sourceUrl,
            @Param("creditLine") String creditLine
    );
}
