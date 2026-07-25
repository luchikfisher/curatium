package com.curatium.artwork.api;

import com.curatium.artwork.application.MuseumArtworkSearchPage;
import com.curatium.artwork.application.MuseumArtworkSearchService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@Validated
@RequestMapping("/api/museum/artworks")
@RequiredArgsConstructor
public class MuseumArtworkController {

    private final MuseumArtworkSearchService museumArtworkSearchService;

    @GetMapping
    public MuseumArtworkSearchPage searchArtworks(
            @RequestParam("q") String q,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(20) int size
    ) {
        return museumArtworkSearchService.search(q, page, size);
    }
}
