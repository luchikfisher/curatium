package com.curatium.exhibition.api;

import java.time.Instant;
import java.util.List;

public record PublicExhibitionDetailResponse(
        Long id,
        String title,
        String summary,
        String introduction,
        Instant publishedAt,
        Long coverArtworkId,
        List<PublicExhibitionItemResponse> items
) {
}
