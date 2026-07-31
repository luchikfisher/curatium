UPDATE artworks
SET thumbnail_url = CASE
    WHEN thumbnail_url ~ '^/api/artwork-images/art-institute/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/thumbnail$'
        THEN thumbnail_url
    WHEN thumbnail_url ~ '^https?://www\.artic\.edu/iiif/2/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/full/(200|400),/0/default\.jpg$'
        THEN regexp_replace(
            thumbnail_url,
            '^https?://www\.artic\.edu/iiif/2/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/full/(200|400),/0/default\.jpg$',
            '/api/artwork-images/art-institute/\1/thumbnail'
        )
    ELSE '/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/thumbnail'
END,
image_url = CASE
    WHEN image_url ~ '^/api/artwork-images/art-institute/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/display$'
        THEN image_url
    WHEN image_url ~ '^https?://www\.artic\.edu/iiif/2/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/full/843,/0/default\.jpg$'
        THEN regexp_replace(
            image_url,
            '^https?://www\.artic\.edu/iiif/2/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/full/843,/0/default\.jpg$',
            '/api/artwork-images/art-institute/\1/display'
        )
    ELSE '/api/artwork-images/art-institute/00000000-0000-0000-0000-000000000000/display'
END
WHERE source = 'ART_INSTITUTE_OF_CHICAGO';
