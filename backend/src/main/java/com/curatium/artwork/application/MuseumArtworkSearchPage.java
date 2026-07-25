package com.curatium.artwork.application;

import java.util.List;

public record MuseumArtworkSearchPage(
        List<MuseumArtworkSearchResult> items,
        int page,
        int pageSize,
        boolean hasNextPage
) {
    public MuseumArtworkSearchPage {
        items = List.copyOf(items);
    }
}
