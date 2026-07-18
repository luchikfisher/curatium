package com.curatium.exhibition.api;

import com.curatium.exhibition.domain.ExhibitionStatus;
import java.time.Instant;

public record ExhibitionSummaryResponse(
        Long id,
        String title,
        String summary,
        ExhibitionStatus status,
        String coverImageUrl,
        int artworkCount,
        Instant updatedAt
) {
}
