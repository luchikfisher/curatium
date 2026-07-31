# Publication sequence

```mermaid
sequenceDiagram
    actor Curator
    participant FE as React curator preview
    participant API as POST /api/exhibitions/{id}/publish
    participant Service as ExhibitionService.publishExhibition
    participant DB as PostgreSQL
    actor Visitor
    participant PublicAPI as GET /api/public/exhibitions/{id}

    Curator->>FE: Choose Publish exhibition
    FE->>API: Send publish request with AbortSignal
    API->>Service: publishExhibition(exhibitionId)

    rect rgb(235, 244, 255)
        Note over Service,DB: TransactionTemplate transaction begins
        Service->>DB: Lock exhibition row

        alt Exhibition is already published
            Service-->>API: InvalidPublicationStateException
            API-->>FE: 409 INVALID_PUBLICATION_STATE
        else Exhibition is draft
            Service->>DB: Count exhibition items
            Service->>DB: Verify selected cover belongs to exhibition

            alt Publication prerequisites are missing
                Note over Service,DB: Title, item, or valid cover is missing
                Service-->>API: InvalidPublicationStateException
                API-->>FE: 409 INVALID_PUBLICATION_STATE
            else Publication prerequisites are satisfied
                Service->>Service: Set status to PUBLISHED
                Service->>Service: Set publishedAt to current time
                Service->>DB: Save and flush exhibition state
                DB->>DB: Commit transaction
                DB-->>Service: Committed exhibition detail
                Service-->>API: ExhibitionDetailResponse
                API-->>FE: 200 PUBLISHED with publishedAt
            end
        end
    end

    Note over Visitor,PublicAPI: Public access happens after a successful commit
    Visitor->>PublicAPI: Request public exhibition detail
    PublicAPI->>DB: Find exhibition by ID and PUBLISHED status

    alt Published exhibition exists
        DB-->>PublicAPI: Exhibition, cover, ordered items, and snapshots
        PublicAPI-->>Visitor: 200 public exhibition detail
    else Exhibition is draft or does not exist
        PublicAPI-->>Visitor: 404 EXHIBITION_NOT_FOUND
    end
```

Publication is an atomic state transition. For a draft exhibition, the backend requires a title,
at least one exhibition item, and a cover that is also an exhibition item. It then persists
`status = PUBLISHED` together with the current `publishedAt` value.

Item ordering is maintained by the persisted exhibition item model. Publication counts the items
but does not perform a separate ordering validation.

The frontend replaces its preview state only with the committed response. After publication, the
exhibition is treated as read-only in the curator interface until a separate unpublish transition
succeeds.

Public availability is intentionally shown as a later read rather than as a notification. The
system does not publish an event or push an update to visitors. Public endpoints simply return
exhibitions whose committed status is `PUBLISHED`.