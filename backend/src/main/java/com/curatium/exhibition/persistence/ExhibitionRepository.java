package com.curatium.exhibition.persistence;

import com.curatium.exhibition.domain.Exhibition;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExhibitionRepository extends JpaRepository<Exhibition, Long> {

    @EntityGraph(attributePaths = "items")
    List<Exhibition> findAllByOrderByUpdatedAtDesc();

    @Override
    @EntityGraph(attributePaths = "items")
    Optional<Exhibition> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select exhibition from Exhibition exhibition where exhibition.id = :exhibitionId")
    Optional<Exhibition> findByIdForUpdate(@Param("exhibitionId") long exhibitionId);
}
