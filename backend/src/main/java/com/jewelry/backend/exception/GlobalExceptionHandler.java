package com.jewelry.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.net.URI;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import jakarta.persistence.EntityNotFoundException;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDeniedException(AccessDeniedException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access Denied");
        problemDetail.setTitle("Access Denied");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/access-denied"));
        return problemDetail;
    }

    /**
     * Bad input. More specific than the RuntimeException handler below, so it
     * wins for IllegalArgumentException. The body stays a ProblemDetail (the
     * existing shape, with "detail") and additionally carries "message", which
     * is what the storefront and admin read from error responses.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgumentException(IllegalArgumentException ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "Bad request";
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message);
        problemDetail.setTitle("Bad Request");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/bad-request"));
        problemDetail.setProperty("message", message);
        return problemDetail;
    }

    /**
     * A dependency we cannot reach right now (e.g. the payment gateway is not
     * configured). 503 tells the client to retry later rather than fix input.
     */
    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleIllegalStateException(IllegalStateException ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "Service unavailable";
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, message);
        problemDetail.setTitle("Service Unavailable");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/service-unavailable"));
        problemDetail.setProperty("message", message);
        return problemDetail;
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ProblemDetail handleEntityNotFoundException(EntityNotFoundException ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "Not found";
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, message);
        problemDetail.setTitle("Not Found");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/not-found"));
        problemDetail.setProperty("message", message);
        return problemDetail;
    }

    @ExceptionHandler(RuntimeException.class)
    public ProblemDetail handleRuntimeException(RuntimeException ex) {
        HttpStatus status = HttpStatus.BAD_REQUEST;
        
        if (ex.getMessage() != null && (ex.getMessage().contains("not found") || ex.getMessage().contains("User not found"))) {
            status = HttpStatus.NOT_FOUND;
        }
        
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, ex.getMessage());
        problemDetail.setTitle("Runtime Exception");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/runtime-exception"));
        return problemDetail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidationExceptions(MethodArgumentNotValidException ex) {
        String errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
                
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed: " + errors);
        problemDetail.setTitle("Validation Error");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/validation-error"));
        return problemDetail;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleException(Exception ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error");
        problemDetail.setTitle("Server Error");
        problemDetail.setType(URI.create("https://www.caratloop.com/errors/internal-server-error"));
        return problemDetail;
    }
}
