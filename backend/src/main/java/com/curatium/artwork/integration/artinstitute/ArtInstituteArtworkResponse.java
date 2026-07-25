package com.curatium.artwork.integration.artinstitute;

record ArtInstituteArtworkResponse(
        Long id,
        String title,
        String artist_display,
        String date_display,
        String medium_display,
        String image_id,
        String credit_line,
        Boolean is_public_domain
) {
}
