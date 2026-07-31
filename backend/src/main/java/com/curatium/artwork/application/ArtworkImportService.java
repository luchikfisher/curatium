package com.curatium.artwork.application;

import com.curatium.artwork.domain.Artwork;
import com.curatium.artwork.domain.ArtworkSource;
import com.curatium.artwork.integration.artinstitute.ArtInstituteClient;
import com.curatium.artwork.integration.artinstitute.ArtInstituteArtworkNotFoundException;
import com.curatium.artwork.integration.cleveland.ClevelandAccessionNumber;
import com.curatium.artwork.integration.cleveland.ClevelandMuseumArtworkNotFoundException;
import com.curatium.artwork.integration.cleveland.ClevelandMuseumClient;
import com.curatium.artwork.persistence.ArtworkRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class ArtworkImportService {

    private final ArtworkRepository artworkRepository;
    private final ArtInstituteClient artInstituteClient;
    private final ClevelandMuseumClient clevelandMuseumClient;
    private final TransactionTemplate transactionTemplate;

    public Artwork importArtwork(ArtworkSource source, String externalId) {
        ArtworkImportPreparation preparation = prepareImport(source, externalId);
        return transactionTemplate.execute(status -> findOrPersist(preparation));
    }

    public ArtworkImportPreparation prepareImport(
            ArtworkSource source,
            String externalId
    ) {
        String normalizedExternalId = externalId.trim();
        if (findLocalArtwork(source, normalizedExternalId).isPresent()) {
            return new ArtworkImportPreparation(source, normalizedExternalId, null);
        }

        MuseumArtworkSearchResult artworkDetails = fetchArtworkDetails(source, normalizedExternalId);

        if (!normalizedExternalId.equals(artworkDetails.externalId())) {
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

        return new ArtworkImportPreparation(
                source,
                normalizedExternalId,
                new ValidatedArtworkSnapshot(
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
                )
        );
    }

    private MuseumArtworkSearchResult fetchArtworkDetails(ArtworkSource source, String externalId) {
        try {
            return switch (source) {
                case ART_INSTITUTE_OF_CHICAGO -> artInstituteClient.getArtwork(externalId);
                case CLEVELAND_MUSEUM_OF_ART -> fetchClevelandArtwork(externalId);
            };
        } catch (ArtInstituteArtworkNotFoundException | ClevelandMuseumArtworkNotFoundException exception) {
            throw new ArtworkNotImportableException(
                    "The artwork was not found by the museum provider."
            );
        }
    }

    private MuseumArtworkSearchResult fetchClevelandArtwork(String externalId) {
        if (!ClevelandAccessionNumber.isCanonical(externalId)) {
            throw new ArtworkNotImportableException(
                    "Artwork identifier must be a valid Cleveland accession number."
            );
        }
        return clevelandMuseumClient.getArtwork(externalId);
    }

    public Artwork findOrPersist(ArtworkImportPreparation preparation) {
        return findLocalArtwork(preparation)
                .orElseGet(() -> persistValidatedSnapshot(preparation));
    }

    public Optional<Artwork> findLocalArtwork(ArtworkImportPreparation preparation) {
        return findLocalArtwork(preparation.source(), preparation.externalId());
    }

    private Optional<Artwork> findLocalArtwork(ArtworkSource source, String externalId) {
        return artworkRepository.findBySourceAndExternalId(source, externalId);
    }

    private Artwork persistValidatedSnapshot(ArtworkImportPreparation preparation) {
        ValidatedArtworkSnapshot snapshot = preparation.validatedSnapshot();
        if (snapshot == null) {
            throw new IllegalStateException("The local artwork snapshot is no longer available.");
        }

        artworkRepository.insertSnapshotIfAbsent(
                snapshot.source().name(),
                snapshot.externalId(),
                snapshot.title(),
                snapshot.artistDisplay(),
                snapshot.dateDisplay(),
                snapshot.mediumDisplay(),
                snapshot.thumbnailUrl(),
                snapshot.imageUrl(),
                snapshot.sourceUrl(),
                snapshot.creditLine()
        );
        return artworkRepository.findBySourceAndExternalId(snapshot.source(), snapshot.externalId())
                .orElseThrow(() -> new IllegalStateException("Unable to persist artwork snapshot."));
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
