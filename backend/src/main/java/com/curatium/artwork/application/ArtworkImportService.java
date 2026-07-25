package com.curatium.artwork.application;

import com.curatium.artwork.domain.Artwork;
import com.curatium.artwork.domain.ArtworkSource;
import com.curatium.artwork.integration.artinstitute.ArtInstituteClient;
import com.curatium.artwork.integration.artinstitute.ArtInstituteArtworkNotFoundException;
import com.curatium.artwork.persistence.ArtworkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class ArtworkImportService {

    private final ArtworkRepository artworkRepository;
    private final ArtInstituteClient artInstituteClient;
    private final TransactionTemplate transactionTemplate;

    public Artwork importArtwork(ArtworkSource source, String externalId) {
        String normalizedExternalId = externalId.trim();

        Artwork existingArtwork =
                artworkRepository.findBySourceAndExternalId(source, normalizedExternalId)
                        .orElse(null);

        if (existingArtwork != null) {
            return existingArtwork;
        }

        MuseumArtworkSearchResult artworkDetails =
                getImportableArtwork(source, normalizedExternalId);

        try {
            return transactionTemplate.execute(status ->
                    artworkRepository
                            .findBySourceAndExternalId(source, normalizedExternalId)
                            .orElseGet(() -> saveSnapshot(source, artworkDetails))
            );
        } catch (DataIntegrityViolationException exception) {
            return artworkRepository
                    .findBySourceAndExternalId(source, normalizedExternalId)
                    .orElseThrow(() -> exception);
        }
    }

    private MuseumArtworkSearchResult getImportableArtwork(
            ArtworkSource source,
            String externalId
    ) {
        if (source != ArtworkSource.ART_INSTITUTE_OF_CHICAGO) {
            throw new ArtworkNotImportableException(
                    "This artwork source is not supported."
            );
        }

        MuseumArtworkSearchResult artworkDetails;
        try {
            artworkDetails = artInstituteClient.getArtwork(externalId);
        } catch (ArtInstituteArtworkNotFoundException exception) {
            throw new ArtworkNotImportableException(
                    "The artwork was not found by the museum provider."
            );
        }

        if (!externalId.equals(artworkDetails.externalId())) {
            throw new ArtworkNotImportableException(
                    "The provider returned a different artwork."
            );
        }

        if (!artworkDetails.publicDomain()) {
            throw new ArtworkNotImportableException(
                    "Only public-domain artworks can be imported."
            );
        }

        if (isBlank(artworkDetails.imageUrl())
                || isBlank(artworkDetails.thumbnailUrl())) {
            throw new ArtworkNotImportableException(
                    "The artwork does not have a usable image."
            );
        }

        return artworkDetails;
    }

    private Artwork saveSnapshot(
            ArtworkSource source,
            MuseumArtworkSearchResult artworkDetails
    ) {
        Artwork artwork = Artwork.importSnapshot(
                source,
                artworkDetails.externalId(),
                artworkDetails.title(),
                artworkDetails.artistDisplay(),
                artworkDetails.dateDisplay(),
                artworkDetails.mediumDisplay(),
                artworkDetails.thumbnailUrl(),
                artworkDetails.imageUrl(),
                artworkDetails.sourceUrl(),
                artworkDetails.creditLine()
        );

        return artworkRepository.saveAndFlush(artwork);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
