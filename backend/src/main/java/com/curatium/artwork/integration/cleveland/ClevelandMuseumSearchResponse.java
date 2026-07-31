package com.curatium.artwork.integration.cleveland;

import java.util.List;

record ClevelandMuseumSearchResponse(
        ClevelandMuseumSearchInfo info,
        List<ClevelandMuseumArtworkResponse> data
) {
}

record ClevelandMuseumSearchInfo(Long total) {
}

record ClevelandMuseumArtworkResponse(
        Long id,
        String accession_number,
        String share_license_status,
        String title,
        String creation_date,
        List<ClevelandMuseumCreatorResponse> creators,
        String technique,
        String measurements,
        String url,
        String creditline,
        ClevelandMuseumImagesResponse images
) {
}

record ClevelandMuseumCreatorResponse(String description) {
}

record ClevelandMuseumImagesResponse(
        ClevelandMuseumImageResponse web,
        ClevelandMuseumImageResponse print
) {
}

record ClevelandMuseumImageResponse(String url) {
}
