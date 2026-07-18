CREATE TABLE artworks (
    id bigserial PRIMARY KEY,
    source varchar(50) NOT NULL,
    external_id varchar(100) NOT NULL,
    title varchar(500) NOT NULL,
    artist_display varchar(1000),
    date_display varchar(255),
    medium_display varchar(1000),
    thumbnail_url text NOT NULL,
    image_url text NOT NULL,
    source_url text,
    credit_line text,
    public_domain boolean NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT artworks_source_external_id_key UNIQUE (source, external_id),
    CONSTRAINT artworks_public_domain_check CHECK (public_domain = true),
    CONSTRAINT artworks_title_check CHECK (length(trim(title)) > 0)
);
