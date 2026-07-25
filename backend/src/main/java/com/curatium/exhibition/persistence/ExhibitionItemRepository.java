package com.curatium.exhibition.persistence;

import com.curatium.exhibition.domain.ExhibitionItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExhibitionItemRepository extends JpaRepository<ExhibitionItem, Long> {

    long countByExhibitionId(long exhibitionId);

    boolean existsByExhibitionIdAndArtworkId(long exhibitionId, long artworkId);
}
