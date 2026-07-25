package com.curatium.exhibition.api;

import com.curatium.exhibition.application.ExhibitionService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/exhibitions")
public class PublicExhibitionController {

    private final ExhibitionService exhibitionService;

    public PublicExhibitionController(ExhibitionService exhibitionService) {
        this.exhibitionService = exhibitionService;
    }

    @GetMapping
    public List<ExhibitionSummaryResponse> listPublishedExhibitions() {
        return exhibitionService.listPublishedExhibitions();
    }

    @GetMapping("/{exhibitionId}")
    public PublicExhibitionDetailResponse getPublishedExhibition(@PathVariable long exhibitionId) {
        return exhibitionService.getPublishedExhibition(exhibitionId);
    }
}
