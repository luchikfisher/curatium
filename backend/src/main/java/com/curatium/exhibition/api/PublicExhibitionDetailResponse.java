package com.curatium.exhibition.api;

import java.util.List;

public record PublicExhibitionDetailResponse(
        Long id,
        String title,
        String summary,
        String introduction,
        Long coverArtworkId,
        List<PublicExhibitionItemResponse> items
) {
}
