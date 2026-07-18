package com.curatium.common.error;

import com.curatium.exhibition.application.ExhibitionNotEditableException;
import com.curatium.exhibition.application.ExhibitionNotFoundException;
import com.curatium.exhibition.application.InvalidExhibitionRequestException;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        List<ApiFieldError> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(this::toFieldError)
                .toList();
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "The request contains invalid values.", fieldErrors);
    }

    @ExceptionHandler(InvalidExhibitionRequestException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidExhibitionRequest(InvalidExhibitionRequestException exception) {
        ApiFieldError fieldError = new ApiFieldError(exception.getField(), exception.getMessage());
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "The request contains invalid values.", List.of(fieldError));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadableRequest() {
        return response(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "The request body could not be read.", List.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        ApiFieldError fieldError = new ApiFieldError(exception.getName(), "Invalid value.");
        return response(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "The request contains an invalid value.", List.of(fieldError));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleUnsupportedMethod() {
        return response(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "The HTTP method is not supported.", List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleUnsupportedMediaType() {
        return response(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "The content type is not supported.", List.of());
    }

    @ExceptionHandler(ExhibitionNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleExhibitionNotFound(ExhibitionNotFoundException exception) {
        return response(HttpStatus.NOT_FOUND, "EXHIBITION_NOT_FOUND", exception.getMessage(), List.of());
    }

    @ExceptionHandler(ExhibitionNotEditableException.class)
    public ResponseEntity<ApiErrorResponse> handleExhibitionNotEditable(ExhibitionNotEditableException exception) {
        return response(HttpStatus.CONFLICT, "PUBLISHED_EXHIBITION_READ_ONLY", exception.getMessage(), List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception exception) {
        LOGGER.error("Unexpected request failure", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred.", List.of());
    }

    private ApiFieldError toFieldError(FieldError error) {
        String message = error.getDefaultMessage() == null ? "Invalid value." : error.getDefaultMessage();
        return new ApiFieldError(error.getField(), message);
    }

    private ResponseEntity<ApiErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            List<ApiFieldError> fieldErrors
    ) {
        ApiErrorResponse body = new ApiErrorResponse(code, message, fieldErrors, Instant.now());
        return ResponseEntity.status(status).body(body);
    }
}
