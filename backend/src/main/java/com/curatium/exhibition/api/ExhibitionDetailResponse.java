package com.curatium.exhibition.api;

import com.curatium.exhibition.domain.ExhibitionStatus;
import java.time.Instant;
import java.util.List;

public record ExhibitionDetailResponse(
        Long id,
        String title,
        String summary,
        String introduction,
        ExhibitionStatus status,
        Instant publishedAt,
        Long coverArtworkId,
        List<ExhibitionItemResponse> items,
        Instant createdAt,
        Instant updatedAt
) {
}
