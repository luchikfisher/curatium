package com.curatium.artwork.persistence;

import com.curatium.artwork.domain.Artwork;
import com.curatium.artwork.domain.ArtworkSource;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArtworkRepository extends JpaRepository<Artwork, Long> {

    Optional<Artwork> findBySourceAndExternalId(ArtworkSource source, String externalId);
}
