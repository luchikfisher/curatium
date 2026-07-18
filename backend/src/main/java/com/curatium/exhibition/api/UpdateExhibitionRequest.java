package com.curatium.exhibition.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateExhibitionRequest(
        @NotBlank(message = "Title is required.") String title,
        @Size(max = 300, message = "Summary must be at most 300 characters.") String summary,
        @Size(max = 5000, message = "Introduction must be at most 5,000 characters.") String introduction
) {
}
