package com.curatium.exhibition.persistence;

import com.curatium.exhibition.domain.ExhibitionItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExhibitionItemRepository extends JpaRepository<ExhibitionItem, Long> {

    long countByExhibitionId(long exhibitionId);

    boolean existsByExhibitionIdAndArtworkId(long exhibitionId, long artworkId);

    Optional<ExhibitionItem> findByIdAndExhibitionId(long itemId, long exhibitionId);

    List<ExhibitionItem> findByExhibitionIdOrderByPositionAsc(long exhibitionId);

    @Modifying
    @Query(value = """
            UPDATE exhibition_items
            SET position = position + :offset
            WHERE exhibition_id = :exhibitionId AND position > :removedPosition
            """, nativeQuery = true)
    int movePositionsAboveRemovedItemOutOfRange(
            @Param("exhibitionId") long exhibitionId,
            @Param("removedPosition") int removedPosition,
            @Param("offset") int offset
    );

    @Modifying
    @Query(value = """
            UPDATE exhibition_items
            SET position = position - :offset - 1
            WHERE exhibition_id = :exhibitionId AND position > :offset
            """, nativeQuery = true)
    int normalizePositionsAfterRemoval(
            @Param("exhibitionId") long exhibitionId,
            @Param("offset") int offset
    );
}
