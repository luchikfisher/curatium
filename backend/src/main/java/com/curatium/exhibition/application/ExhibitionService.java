package com.curatium.exhibition.application;

import com.curatium.artwork.application.ArtworkImportService;
import com.curatium.artwork.application.ArtworkImportPreparation;
import com.curatium.artwork.domain.Artwork;
import com.curatium.exhibition.api.AddExhibitionItemRequest;
import com.curatium.exhibition.api.CreateExhibitionRequest;
import com.curatium.exhibition.api.ExhibitionDetailResponse;
import com.curatium.exhibition.api.ExhibitionArtworkResponse;
import com.curatium.exhibition.api.ExhibitionItemResponse;
import com.curatium.exhibition.api.ExhibitionSummaryResponse;
import com.curatium.exhibition.api.UpdateExhibitionRequest;
import com.curatium.exhibition.domain.Exhibition;
import com.curatium.exhibition.domain.ExhibitionItem;
import com.curatium.exhibition.persistence.ExhibitionItemRepository;
import com.curatium.exhibition.persistence.ExhibitionRepository;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ExhibitionService {

    private static final int MAXIMUM_ARTWORK_COUNT = 10;

    private final ExhibitionRepository exhibitionRepository;
    private final ExhibitionItemRepository exhibitionItemRepository;
    private final ArtworkImportService artworkImportService;
    private final TransactionTemplate transactionTemplate;

    public ExhibitionService(
            ExhibitionRepository exhibitionRepository,
            ExhibitionItemRepository exhibitionItemRepository,
            ArtworkImportService artworkImportService,
            TransactionTemplate transactionTemplate
    ) {
        this.exhibitionRepository = exhibitionRepository;
        this.exhibitionItemRepository = exhibitionItemRepository;
        this.artworkImportService = artworkImportService;
        this.transactionTemplate = transactionTemplate;
    }

    @Transactional(readOnly = true)
    public List<ExhibitionSummaryResponse> listExhibitions() {
        return exhibitionRepository.findAllByOrderByUpdatedAtDesc().stream()
                .map(this::toSummaryResponse)
                .toList();
    }

    @Transactional
    public ExhibitionDetailResponse createExhibition(CreateExhibitionRequest request) {
        Exhibition exhibition = Exhibition.createDraft(
                normalizeTitle(request.title()),
                normalizeOptionalText(request.summary()),
                normalizeOptionalText(request.introduction())
        );
        return toDetailResponse(exhibitionRepository.save(exhibition));
    }

    @Transactional(readOnly = true)
    public ExhibitionDetailResponse getExhibition(long exhibitionId) {
        return toDetailResponse(getRequiredExhibition(exhibitionId));
    }

    @Transactional
    public ExhibitionDetailResponse updateExhibition(long exhibitionId, UpdateExhibitionRequest request) {
        Exhibition exhibition = getRequiredExhibition(exhibitionId);
        requireDraft(exhibition);
        exhibition.updateMetadata(
                normalizeTitle(request.title()),
                normalizeOptionalText(request.summary()),
                normalizeOptionalText(request.introduction())
        );
        return toDetailResponse(exhibitionRepository.saveAndFlush(exhibition));
    }

    @Transactional
    public void deleteDraftExhibition(long exhibitionId) {
        Exhibition exhibition = getRequiredExhibition(exhibitionId);
        requireDraft(exhibition);
        exhibitionRepository.delete(exhibition);
    }

    public ExhibitionItemResponse addArtwork(long exhibitionId, AddExhibitionItemRequest request) {
        validateCanAddArtwork(exhibitionId);
        ArtworkImportPreparation importPreparation = artworkImportService.prepareImport(
                request.source(),
                request.externalId()
        );

        try {
            return transactionTemplate.execute(status -> addArtworkInTransaction(exhibitionId, importPreparation));
        } catch (DataIntegrityViolationException exception) {
            if (artworkImportService.findLocalArtwork(importPreparation)
                    .filter(artwork -> exhibitionItemRepository.existsByExhibitionIdAndArtworkId(
                            exhibitionId,
                            artwork.getId()
                    ))
                    .isPresent()) {
                throw new DuplicateExhibitionArtworkException(exhibitionId);
            }
            throw exception;
        }
    }

    private ExhibitionItemResponse addArtworkInTransaction(
            long exhibitionId,
            ArtworkImportPreparation importPreparation
    ) {
        Exhibition exhibition = exhibitionRepository.findByIdForUpdate(exhibitionId)
                .orElseThrow(() -> new ExhibitionNotFoundException(exhibitionId));
        requireDraft(exhibition);

        long itemCount = exhibitionItemRepository.countByExhibitionId(exhibitionId);
        if (itemCount >= MAXIMUM_ARTWORK_COUNT) {
            throw new ExhibitionCapacityExceededException(exhibitionId);
        }

        Artwork artwork = artworkImportService.findOrPersist(importPreparation);
        if (exhibitionItemRepository.existsByExhibitionIdAndArtworkId(exhibitionId, artwork.getId())) {
            throw new DuplicateExhibitionArtworkException(exhibitionId);
        }

        ExhibitionItem item = ExhibitionItem.addTo(exhibition, artwork, (int) itemCount + 1);
        return toItemResponse(exhibitionItemRepository.saveAndFlush(item));
    }

    private void validateCanAddArtwork(long exhibitionId) {
        Exhibition exhibition = getRequiredExhibition(exhibitionId);
        requireDraft(exhibition);
        if (exhibitionItemRepository.countByExhibitionId(exhibitionId) >= MAXIMUM_ARTWORK_COUNT) {
            throw new ExhibitionCapacityExceededException(exhibitionId);
        }
    }

    private Exhibition getRequiredExhibition(long exhibitionId) {
        return exhibitionRepository.findById(exhibitionId)
                .orElseThrow(() -> new ExhibitionNotFoundException(exhibitionId));
    }

    private void requireDraft(Exhibition exhibition) {
        if (!exhibition.isDraft()) {
            throw new ExhibitionNotEditableException(exhibition.getId());
        }
    }

    private String normalizeTitle(String title) {
        String normalizedTitle = title.trim();
        if (normalizedTitle.length() > 150) {
            throw new InvalidExhibitionRequestException("title", "Title must be at most 150 characters.");
        }
        return normalizedTitle;
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private ExhibitionSummaryResponse toSummaryResponse(Exhibition exhibition) {
        String coverImageUrl = exhibition.getCoverArtwork() == null
                ? null
                : exhibition.getCoverArtwork().getThumbnailUrl();
        return new ExhibitionSummaryResponse(
                exhibition.getId(),
                exhibition.getTitle(),
                exhibition.getSummary(),
                exhibition.getStatus(),
                coverImageUrl,
                exhibition.getItems().size(),
                exhibition.getUpdatedAt()
        );
    }

    private ExhibitionDetailResponse toDetailResponse(Exhibition exhibition) {
        Long coverArtworkId = exhibition.getCoverArtwork() == null ? null : exhibition.getCoverArtwork().getId();
        List<ExhibitionItemResponse> items = exhibition.getItems().stream()
                .map(this::toItemResponse)
                .toList();
        return new ExhibitionDetailResponse(
                exhibition.getId(),
                exhibition.getTitle(),
                exhibition.getSummary(),
                exhibition.getIntroduction(),
                exhibition.getStatus(),
                coverArtworkId,
                items,
                exhibition.getCreatedAt(),
                exhibition.getUpdatedAt()
        );
    }

    private ExhibitionItemResponse toItemResponse(ExhibitionItem item) {
        return new ExhibitionItemResponse(
                item.getId(),
                toArtworkResponse(item.getArtwork()),
                item.getPosition(),
                item.getCuratorialNote()
        );
    }

    private ExhibitionArtworkResponse toArtworkResponse(Artwork artwork) {
        return new ExhibitionArtworkResponse(
                artwork.getId(),
                artwork.getSource(),
                artwork.getExternalId(),
                artwork.getTitle(),
                artwork.getArtistDisplay(),
                artwork.getDateDisplay(),
                artwork.getMediumDisplay(),
                artwork.getThumbnailUrl(),
                artwork.getImageUrl(),
                artwork.getSourceUrl(),
                artwork.getCreditLine(),
                artwork.isPublicDomain()
        );
    }
}
