package com.curatium.exhibition.persistence;

import com.curatium.exhibition.domain.Exhibition;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExhibitionRepository extends JpaRepository<Exhibition, Long> {

    @EntityGraph(attributePaths = "items")
    List<Exhibition> findAllByOrderByUpdatedAtDesc();

    @Override
    @EntityGraph(attributePaths = "items")
    Optional<Exhibition> findById(Long id);
}
