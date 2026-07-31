CREATE TABLE demo_showcase_seeds (
    seed_key varchar(100) PRIMARY KEY,
    exhibition_id bigint NOT NULL UNIQUE,
    CONSTRAINT demo_showcase_seeds_exhibition_fk
        FOREIGN KEY (exhibition_id) REFERENCES exhibitions (id) ON DELETE CASCADE
);

CREATE TABLE demo_showcase_seed_artworks (
    seed_key varchar(100) NOT NULL,
    artwork_id bigint NOT NULL,
    PRIMARY KEY (seed_key, artwork_id),
    CONSTRAINT demo_showcase_seed_artworks_seed_fk
        FOREIGN KEY (seed_key) REFERENCES demo_showcase_seeds (seed_key) ON DELETE CASCADE,
    CONSTRAINT demo_showcase_seed_artworks_artwork_fk
        FOREIGN KEY (artwork_id) REFERENCES artworks (id) ON DELETE CASCADE
);
