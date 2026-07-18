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

    @PutMapping("/{exhibitionId}")
    public ExhibitionDetailResponse updateExhibition(
            @PathVariable long exhibitionId,
            @Valid @RequestBody UpdateExhibitionRequest request
    ) {
        return exhibitionService.updateExhibition(exhibitionId, request);
    }

    @DeleteMapping("/{exhibitionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExhibition(@PathVariable long exhibitionId) {
        exhibitionService.deleteDraftExhibition(exhibitionId);
    }
}
