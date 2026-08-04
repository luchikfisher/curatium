package com.curatium.exhibition.api;

import com.curatium.exhibition.application.ExhibitionService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exhibitions")
public class ExhibitionController {

    private final ExhibitionService exhibitionService;

    public ExhibitionController(ExhibitionService exhibitionService) {
        this.exhibitionService = exhibitionService;
    }

    @GetMapping
    public List<ExhibitionSummaryResponse> listExhibitions() {
        return exhibitionService.listExhibitions();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExhibitionDetailResponse createExhibition(@Valid @RequestBody CreateExhibitionRequest request) {
        return exhibitionService.createExhibition(request);
    }

    @GetMapping("/{exhibitionId}")
    public ExhibitionDetailResponse getExhibition(@PathVariable long exhibitionId) {
        return exhibitionService.getExhibition(exhibitionId);
    }

    @PostMapping("/{exhibitionId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public ExhibitionItemResponse addExhibitionItem(
            @PathVariable long exhibitionId,
            @Valid @RequestBody AddExhibitionItemRequest request
    ) {
        return exhibitionService.addArtwork(exhibitionId, request);
    }

    @PutMapping("/{exhibitionId}/items/{itemId}")
    public ExhibitionItemResponse updateCuratorialNote(
            @PathVariable long exhibitionId,
            @PathVariable long itemId,
            @Valid @RequestBody UpdateCuratorialNoteRequest request
    ) {
        return exhibitionService.updateCuratorialNote(exhibitionId, itemId, request);
    }

    @DeleteMapping("/{exhibitionId}/items/{itemId}")
    public ExhibitionDetailResponse removeExhibitionItem(
            @PathVariable long exhibitionId,
            @PathVariable long itemId
    ) {
        return exhibitionService.removeExhibitionItem(exhibitionId, itemId);
    }

    @PostMapping("/{exhibitionId}/items/{itemId}/move-up")
    public List<ExhibitionItemResponse> moveExhibitionItemUp(
            @PathVariable long exhibitionId,
            @PathVariable long itemId
    ) {
        return exhibitionService.moveExhibitionItemUp(exhibitionId, itemId);
    }

    @PostMapping("/{exhibitionId}/items/{itemId}/move-down")
    public List<ExhibitionItemResponse> moveExhibitionItemDown(
            @PathVariable long exhibitionId,
            @PathVariable long itemId
    ) {
        return exhibitionService.moveExhibitionItemDown(exhibitionId, itemId);
    }

    @PutMapping("/{exhibitionId}")
    public ExhibitionDetailResponse updateExhibition(
            @PathVariable long exhibitionId,
            @Valid @RequestBody UpdateExhibitionRequest request
    ) {
        return exhibitionService.updateExhibition(exhibitionId, request);
    }

    @PutMapping("/{exhibitionId}/cover")
    public ExhibitionDetailResponse selectCoverArtwork(
            @PathVariable long exhibitionId,
            @Valid @RequestBody CoverArtworkRequest request
    ) {
        return exhibitionService.selectCoverArtwork(exhibitionId, request);
    }

    @DeleteMapping("/{exhibitionId}/cover")
    public ExhibitionDetailResponse clearCoverArtwork(@PathVariable long exhibitionId) {
        return exhibitionService.clearCoverArtwork(exhibitionId);
    }

    @PostMapping("/{exhibitionId}/publish")
    public ExhibitionDetailResponse publishExhibition(@PathVariable long exhibitionId) {
        return exhibitionService.publishExhibition(exhibitionId);
    }

    @PostMapping("/{exhibitionId}/unpublish")
    public ExhibitionDetailResponse unpublishExhibition(@PathVariable long exhibitionId) {
        return exhibitionService.unpublishExhibition(exhibitionId);
    }

    @DeleteMapping("/{exhibitionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExhibition(@PathVariable long exhibitionId) {
        exhibitionService.deleteDraftExhibition(exhibitionId);
    }
}
