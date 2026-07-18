package com.curatium.common.error;

import java.time.Instant;
import java.util.List;

public record ApiErrorResponse(
        String code,
        String message,
        List<ApiFieldError> fieldErrors,
        Instant timestamp
) {
}
