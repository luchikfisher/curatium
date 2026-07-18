CREATE TABLE exhibition_items (
    id bigserial PRIMARY KEY,
    exhibition_id bigint NOT NULL,
    artwork_id bigint NOT NULL,
    position integer NOT NULL,
    curatorial_note text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT exhibition_items_exhibition_fk
        FOREIGN KEY (exhibition_id) REFERENCES exhibitions (id) ON DELETE CASCADE,
    CONSTRAINT exhibition_items_artwork_fk
        FOREIGN KEY (artwork_id) REFERENCES artworks (id),
    CONSTRAINT exhibition_items_exhibition_artwork_key UNIQUE (exhibition_id, artwork_id),
    CONSTRAINT exhibition_items_exhibition_position_key UNIQUE (exhibition_id, position),
    CONSTRAINT exhibition_items_position_check CHECK (position >= 1)
);

CREATE INDEX exhibition_items_exhibition_id_idx ON exhibition_items (exhibition_id);
CREATE INDEX exhibition_items_artwork_id_idx ON exhibition_items (artwork_id);
