# Artwork import sequence

```mermaid
sequenceDiagram
    actor Curator
    participant FE as React artwork curation page
    participant API as POST /api/exhibitions/{id}/items
    participant Service as ExhibitionService.addArtwork
    participant Import as ArtworkImportService
    participant AIC as Art Institute API
    participant DB as PostgreSQL

    Curator->>FE: Add result using source and externalId
    FE->>API: POST source and externalId
    API->>Service: addArtwork(exhibitionId, request)
    Service->>DB: Verify exhibition exists, is DRAFT, and is below capacity

    alt Exhibition is missing, published, or already at capacity
        Service-->>API: Domain exception
        API-->>FE: 404 or 409 domain error
    else Initial exhibition check succeeds
        Service->>Import: prepareImport(source, externalId)
        Import->>DB: Find artwork by source and externalId

        alt Local snapshot exists
            DB-->>Import: Existing artwork snapshot
            Import-->>Service: Prepared local snapshot
        else Local snapshot does not exist
            Import->>AIC: GET authoritative artwork detail

            alt Provider request fails
                AIC-->>Import: Timeout, transport error, malformed response, or 5xx
                Import-->>API: ArtInstituteIntegrationException
                API-->>FE: 503 MUSEUM_SERVICE_UNAVAILABLE
            else Provider returns artwork detail
                AIC-->>Import: Artwork detail
                Import->>Import: Validate ID, public-domain status, thumbnail, and image

                alt Artwork is not importable
                    Import-->>API: ArtworkNotImportableException
                    API-->>FE: 422 ARTWORK_NOT_IMPORTABLE
                else Artwork is importable
                    Import-->>Service: Prepared validated snapshot

                    rect rgb(235, 244, 255)
                        Note over Service,DB: Transaction begins after import preparation succeeds
                        Service->>DB: Lock exhibition row
                        Service->>DB: Recheck draft state and capacity
                        Service->>Import: findOrPersist(prepared snapshot)

                        alt Snapshot already exists
                            Import->>DB: Reuse local snapshot
                        else Snapshot must be created
                            Import->>DB: Insert snapshot if absent
                            Note over Import,DB: Source and externalId are unique
                        end

                        Service->>DB: Check duplicate exhibition membership
                        Service->>DB: Insert exhibition item at next position

                        alt Membership persistence succeeds
                            DB->>DB: Commit transaction
                            DB-->>Service: Committed item and artwork snapshot
                            Service-->>API: ExhibitionItemResponse
                            API-->>FE: 201 Created
                        else Domain conflict occurs
                            DB->>DB: Roll back transaction
                            Service-->>API: Domain exception
                            API-->>FE: 404 or 409 domain error
                        else Unexpected persistence failure occurs
                            DB->>DB: Roll back transaction
                            Service-->>API: Persistence exception
                            API-->>FE: 500 INTERNAL_ERROR
                        end
                    end
                end
            end
        end
    end
```

Import preparation happens before the membership transaction, allowing the authoritative provider
detail to be retrieved and validated without holding the exhibition lock. Provider outages terminate
with `503 MUSEUM_SERVICE_UNAVAILABLE`. A missing, mismatched, non-public-domain, or otherwise unusable
artwork terminates with `422 ARTWORK_NOT_IMPORTABLE`.

Only a successfully prepared import enters the transaction. The transaction locks and rechecks the
exhibition, reuses or persists the local artwork snapshot, and creates the ordered exhibition
membership. A successful transaction commits and returns `201 Created`. Domain conflicts or
persistence failures roll back, so neither the exhibition item nor a newly inserted artwork snapshot
is committed by a failed import.