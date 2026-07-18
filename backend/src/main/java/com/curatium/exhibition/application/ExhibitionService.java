package com.curatium.exhibition.application;

import com.curatium.exhibition.api.CreateExhibitionRequest;
import com.curatium.exhibition.api.ExhibitionDetailResponse;
import com.curatium.exhibition.api.ExhibitionItemResponse;
import com.curatium.exhibition.api.ExhibitionSummaryResponse;
import com.curatium.exhibition.api.UpdateExhibitionRequest;
import com.curatium.exhibition.domain.Exhibition;
import com.curatium.exhibition.domain.ExhibitionItem;
import com.curatium.exhibition.persistence.ExhibitionRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExhibitionService {

    private final ExhibitionRepository exhibitionRepository;

    public ExhibitionService(ExhibitionRepository exhibitionRepository) {
        this.exhibitionRepository = exhibitionRepository;
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
                item.getArtwork().getId(),
                item.getPosition(),
                item.getCuratorialNote()
        );
    }
}
