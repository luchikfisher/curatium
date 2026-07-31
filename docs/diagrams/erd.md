# Entity relationship diagram

```mermaid
erDiagram
    artworks {
        bigint id PK
        varchar source "unique with external_id"
        varchar external_id "unique with source"
        varchar title
        varchar artist_display "nullable"
        varchar date_display "nullable"
        varchar medium_display "nullable"
        text thumbnail_url
        text image_url
        text source_url "nullable"
        text credit_line "nullable"
        boolean public_domain
        timestamptz imported_at
    }

    exhibitions {
        bigint id PK
        varchar title
        varchar summary "nullable"
        text introduction "nullable"
        varchar status "DRAFT or PUBLISHED"
        bigint cover_artwork_id FK "nullable"
        timestamptz created_at
        timestamptz updated_at
        timestamptz published_at "nullable"
    }

    exhibition_items {
        bigint id PK
        bigint exhibition_id FK "unique with artwork_id and position"
        bigint artwork_id FK "unique with exhibition_id"
        integer position "unique with exhibition_id"
        text curatorial_note "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    demo_showcase_seeds {
        varchar seed_key PK
        bigint exhibition_id FK "unique ownership mapping"
    }

    demo_showcase_seed_artworks {
        varchar seed_key PK "FK to demo_showcase_seeds"
        bigint artwork_id PK "FK to artworks"
    }

    artworks ||--o{ exhibition_items : "is reused by"
    exhibitions ||--o{ exhibition_items : "contains"
    artworks o|--o{ exhibitions : "is optional cover for"
    exhibitions ||--o| demo_showcase_seeds : "may be owned by demo seed"
    demo_showcase_seeds ||--o{ demo_showcase_seed_artworks : "tracks owned snapshots"
    artworks ||--o{ demo_showcase_seed_artworks : "may be demo-owned"
```

`artworks` is a locally persisted provider snapshot, while `exhibition_items` supplies the ordered
many-to-many membership. `cover_artwork_id`, summary, introduction, notes, and `published_at` are
nullable as shown; item position is unique within an exhibition, and source plus external ID is
unique for an artwork. The demo ownership tables were introduced by V6 and track only the opt-in
showcase, not normal curator data.

The diagram omits database check constraints such as public-domain-only artwork snapshots and
positive item positions from the field list, but retains the relationships and uniqueness rules
that shape application behavior.
