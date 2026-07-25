package com.curatium.artwork.integration.artinstitute;

import java.util.List;

record ArtInstituteSearchResponse(
        List<ArtInstituteArtworkResponse> data,
        ArtInstitutePaginationResponse pagination,
        ArtInstituteConfigurationResponse config
) {
}
