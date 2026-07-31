package com.curatium.common.error;

import com.curatium.artwork.application.ArtworkNotImportableException;
import com.curatium.artwork.application.ArtworkImageNotFoundException;
import com.curatium.artwork.application.ArtworkImageUnavailableException;
import com.curatium.artwork.application.InvalidArtworkImageRequestException;
import com.curatium.artwork.application.InvalidMuseumSearchRequestException;
import com.curatium.artwork.integration.MuseumProviderIntegrationException;
import com.curatium.exhibition.application.ExhibitionNotEditableException;
import com.curatium.exhibition.application.ExhibitionItemNotFoundException;
import com.curatium.exhibition.application.ExhibitionCapacityExceededException;
import com.curatium.exhibition.application.ExhibitionNotFoundException;
import com.curatium.exhibition.application.DuplicateExhibitionArtworkException;
import com.curatium.exhibition.application.InvalidExhibitionRequestException;
import com.curatium.exhibition.application.InvalidCoverArtworkException;
import com.curatium.exhibition.application.InvalidPublicationStateException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(ApiExceptionHandler.class);

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        List<ApiFieldError> fieldErrors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(this::toFieldError)
                .toList();

        return response(
                status,
                "VALIDATION_ERROR",
                "The request contains invalid values.",
                fieldErrors,
                headers
        );
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        return response(
                status,
                "MALFORMED_REQUEST",
                "The request body could not be read.",
                List.of(),
                headers
        );
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ApiFieldError fieldError = new ApiFieldError(
                fieldName(exception),
                "Invalid value."
        );

        return response(
                status,
                "MALFORMED_REQUEST",
                "The request contains an invalid value.",
                List.of(fieldError),
                headers
        );
    }

    @ExceptionHandler(InvalidExhibitionRequestException.class)
    public ResponseEntity<Object> handleInvalidExhibitionRequest(
            InvalidExhibitionRequestException exception
    ) {
        ApiFieldError fieldError = new ApiFieldError(
                exception.getField(),
                exception.getMessage()
        );

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "The request contains invalid values.",
                List.of(fieldError)
        );
    }

    @ExceptionHandler(InvalidMuseumSearchRequestException.class)
    public ResponseEntity<Object> handleInvalidMuseumSearchRequest(
            InvalidMuseumSearchRequestException exception
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "The request contains invalid values.",
                List.of(new ApiFieldError(exception.getField(), exception.getMessage()))
        );
    }

    @ExceptionHandler(InvalidArtworkImageRequestException.class)
    public ResponseEntity<Object> handleInvalidArtworkImageRequest(InvalidArtworkImageRequestException exception) {
        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                exception.getMessage(),
                List.of(),
                artworkImageErrorHeaders()
        );
    }

    @ExceptionHandler(ArtworkImageNotFoundException.class)
    public ResponseEntity<Object> handleArtworkImageNotFound(ArtworkImageNotFoundException exception) {
        return response(
                HttpStatus.NOT_FOUND,
                "ARTWORK_IMAGE_NOT_FOUND",
                exception.getMessage(),
                List.of(),
                artworkImageErrorHeaders()
        );
    }

    @ExceptionHandler(ArtworkImageUnavailableException.class)
    public ResponseEntity<Object> handleArtworkImageUnavailable(ArtworkImageUnavailableException exception) {
        return response(
                HttpStatus.SERVICE_UNAVAILABLE,
                "ARTWORK_IMAGE_UNAVAILABLE",
                "The artwork image is temporarily unavailable.",
                List.of(),
                artworkImageErrorHeaders()
        );
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException exception) {
        List<ApiFieldError> fieldErrors = exception.getConstraintViolations().stream()
                .map(this::toFieldError)
                .toList();
        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "The request contains invalid values.",
                fieldErrors
        );
    }

    @ExceptionHandler(ExhibitionNotFoundException.class)
    public ResponseEntity<Object> handleExhibitionNotFound(
            ExhibitionNotFoundException exception
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "EXHIBITION_NOT_FOUND",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(ExhibitionItemNotFoundException.class)
    public ResponseEntity<Object> handleExhibitionItemNotFound(
            ExhibitionItemNotFoundException exception
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "EXHIBITION_ITEM_NOT_FOUND",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(ExhibitionNotEditableException.class)
    public ResponseEntity<Object> handleExhibitionNotEditable(
            ExhibitionNotEditableException exception
    ) {
        return response(
                HttpStatus.CONFLICT,
                "PUBLISHED_EXHIBITION_READ_ONLY",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(DuplicateExhibitionArtworkException.class)
    public ResponseEntity<Object> handleDuplicateExhibitionArtwork(
            DuplicateExhibitionArtworkException exception
    ) {
        return response(
                HttpStatus.CONFLICT,
                "DUPLICATE_EXHIBITION_ARTWORK",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(ExhibitionCapacityExceededException.class)
    public ResponseEntity<Object> handleExhibitionCapacityExceeded(
            ExhibitionCapacityExceededException exception
    ) {
        return response(
                HttpStatus.CONFLICT,
                "EXHIBITION_ARTWORK_LIMIT_REACHED",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(InvalidCoverArtworkException.class)
    public ResponseEntity<Object> handleInvalidCoverArtwork(InvalidCoverArtworkException exception) {
        return response(
                HttpStatus.CONFLICT,
                "INVALID_COVER_ARTWORK",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(InvalidPublicationStateException.class)
    public ResponseEntity<Object> handleInvalidPublicationState(InvalidPublicationStateException exception) {
        return response(
                HttpStatus.CONFLICT,
                "INVALID_PUBLICATION_STATE",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(ArtworkNotImportableException.class)
    public ResponseEntity<Object> handleArtworkNotImportable(ArtworkNotImportableException exception) {
        return response(
                HttpStatus.UNPROCESSABLE_CONTENT,
                "ARTWORK_NOT_IMPORTABLE",
                exception.getMessage(),
                List.of()
        );
    }

    @ExceptionHandler(MuseumProviderIntegrationException.class)
    public ResponseEntity<Object> handleMuseumServiceFailure(MuseumProviderIntegrationException exception) {
        return response(
                HttpStatus.SERVICE_UNAVAILABLE,
                "MUSEUM_SERVICE_UNAVAILABLE",
                "The museum service is temporarily unavailable.",
                List.of()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception exception) {
        LOGGER.error("Unexpected request failure", exception);

        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An unexpected error occurred.",
                List.of()
        );
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        if (status.is5xxServerError()) {
            LOGGER.error("Unexpected Spring MVC failure", exception);
        }

        ApiErrorResponse errorResponse = new ApiErrorResponse(
                errorCode(status),
                errorMessage(status),
                List.of(),
                Instant.now()
        );

        return super.handleExceptionInternal(
                exception,
                errorResponse,
                headers,
                status,
                request
        );
    }

    private ApiFieldError toFieldError(FieldError error) {
        String message = error.getDefaultMessage() == null
                ? "Invalid value."
                : error.getDefaultMessage();

        return new ApiFieldError(error.getField(), message);
    }

    private ApiFieldError toFieldError(ConstraintViolation<?> violation) {
        String propertyPath = violation.getPropertyPath().toString();
        int separator = propertyPath.lastIndexOf('.');
        String field = separator == -1 ? propertyPath : propertyPath.substring(separator + 1);
        return new ApiFieldError(field, violation.getMessage());
    }

    private String fieldName(TypeMismatchException exception) {
        if (exception instanceof MethodArgumentTypeMismatchException argumentException) {
            return argumentException.getName();
        }

        return exception.getPropertyName() == null
                ? "request"
                : exception.getPropertyName();
    }

    private String errorCode(HttpStatusCode status) {
        if (status.is5xxServerError()) {
            return "INTERNAL_ERROR";
        }

        return switch (status.value()) {
            case 400 -> "MALFORMED_REQUEST";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> "HTTP_" + status.value();
        };
    }

    private String errorMessage(HttpStatusCode status) {
        if (status.is5xxServerError()) {
            return "An unexpected error occurred.";
        }

        return switch (status.value()) {
            case 400 -> "The request is invalid.";
            case 404 -> "The requested resource was not found.";
            case 405 -> "The HTTP method is not supported.";
            case 415 -> "The content type is not supported.";
            default -> "The request could not be processed.";
        };
    }

    private ResponseEntity<Object> response(
            HttpStatusCode status,
            String code,
            String message,
            List<ApiFieldError> fieldErrors
    ) {
        return response(
                status,
                code,
                message,
                fieldErrors,
                HttpHeaders.EMPTY
        );
    }

    private ResponseEntity<Object> response(
            HttpStatusCode status,
            String code,
            String message,
            List<ApiFieldError> fieldErrors,
            HttpHeaders headers
    ) {
        ApiErrorResponse body = new ApiErrorResponse(
                code,
                message,
                fieldErrors,
                Instant.now()
        );

        return new ResponseEntity<>(body, headers, status);
    }

    private HttpHeaders artworkImageErrorHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setCacheControl(CacheControl.noStore());
        return headers;
    }
}
