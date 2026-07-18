package com.curatium.artwork.persistence;

import com.curatium.artwork.domain.Artwork;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArtworkRepository extends JpaRepository<Artwork, Long> {
}
