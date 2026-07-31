package com.curatium.artwork.integration.cleveland;

import java.util.regex.Pattern;

/**
 * Validates a Cleveland Museum of Art accession number before it becomes a Curatium external ID.
 *
 * <p>The accepted character set is deliberately safe for the provider-owned CDN path that will be
 * introduced separately. It supports the dotted and hyphenated accession formats returned by the
 * museum while excluding whitespace and URL, query, fragment, and path syntax.</p>
 */
public final class ClevelandAccessionNumber {

    private static final int MAXIMUM_LENGTH = 100;
    private static final Pattern CANONICAL_ACCESSION = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    private ClevelandAccessionNumber() {
    }

    public static boolean isCanonical(String value) {
        return value != null
                && value.length() <= MAXIMUM_LENGTH
                && CANONICAL_ACCESSION.matcher(value).matches();
    }
}
