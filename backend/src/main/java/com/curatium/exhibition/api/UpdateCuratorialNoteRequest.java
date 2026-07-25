package com.curatium.exhibition.api;

import jakarta.validation.constraints.Size;

public record UpdateCuratorialNoteRequest(
        @Size(max = 2000, message = "Curatorial note must be at most 2000 characters.")
        String curatorialNote
) {
}
