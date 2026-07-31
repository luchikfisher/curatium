package com.curatium.artwork.api;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ArtworkImageErrorCacheControlFilter extends OncePerRequestFilter {

    private static final String ARTWORK_IMAGE_PATH = "/api/artwork-images/";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(ARTWORK_IMAGE_PATH);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        // Framework-generated 404 and 405 responses can commit during dispatch, so establish
        // the error-safe default before they are written. Successful controllers replace it.
        response.setHeader("Cache-Control", "no-store");
        filterChain.doFilter(request, response);
    }
}
