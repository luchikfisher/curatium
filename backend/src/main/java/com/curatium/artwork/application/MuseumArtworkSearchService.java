package com.curatium.artwork.application;

import com.curatium.artwork.integration.artinstitute.ArtInstituteClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MuseumArtworkSearchService {

    private final ArtInstituteClient artInstituteClient;

    public MuseumArtworkSearchPage search(String query, int page, int size) {
        String normalizedQuery = normalizeQuery(query);
        return artInstituteClient.search(normalizedQuery, page, size);
    }

    private String normalizeQuery(String query) {
        String normalizedQuery = query == null ? "" : query.trim();
        if (normalizedQuery.length() < 2 || normalizedQuery.length() > 100) {
            throw new InvalidMuseumSearchRequestException(
                    "q",
                    "Search query must be between 2 and 100 characters."
            );
        }
        return normalizedQuery;
    }
}
