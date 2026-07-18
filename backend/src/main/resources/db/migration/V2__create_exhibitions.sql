CREATE TABLE exhibitions (
    id bigserial PRIMARY KEY,
    title varchar(150) NOT NULL,
    summary varchar(300),
    introduction text,
    status varchar(20) NOT NULL,
    cover_artwork_id bigint,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT exhibitions_cover_artwork_fk
        FOREIGN KEY (cover_artwork_id) REFERENCES artworks (id),
    CONSTRAINT exhibitions_status_check CHECK (status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT exhibitions_title_check CHECK (length(trim(title)) > 0)
);
