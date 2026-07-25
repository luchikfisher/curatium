package com.curatium.artwork.integration.artinstitute;

record ArtInstitutePaginationResponse(
        int limit,
        int current_page,
        String next_url
) {
}
