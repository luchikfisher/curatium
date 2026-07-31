package com.curatium.artwork.application;

public interface MuseumArtworkSearchProvider {

    MuseumArtworkSearchPage search(String query, int page, int pageSize);
}
