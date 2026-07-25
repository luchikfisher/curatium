package com.curatium.artwork.application;

import com.curatium.artwork.integration.artinstitute.ArtInstituteClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MuseumArtworkSearchService {

    private final ArtInstituteClient artInstituteClient;

    public MuseumArtworkSearchPage search(String query, int page, int size) {
        return artInstituteClient.search(query, page, size);
    }
}