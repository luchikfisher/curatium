import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isFrontendError, type FrontendError } from '../api/errors'
import { EmptyState, LoadingState } from '../components/AsyncState'
import {
  addExhibitionArtwork,
  getExhibition,
  searchMuseumArtworks,
} from '../features/exhibitions/api'
import { useExhibition } from '../features/exhibitions/useExhibition'
import type {
  ExhibitionDetail,
  MuseumArtworkSearchPage,
  MuseumArtworkSearchResult,
} from '../features/exhibitions/types'

const SEARCH_PAGE_SIZE = 20

export function ArtworkSearchPage() {
  const { id } = useParams()
  const exhibitionId = parseExhibitionId(id)
  if (exhibitionId === null) return <InvalidExhibitionRoute />
  return <ArtworkSearchEditor key={id} exhibitionId={exhibitionId} />
}

function ArtworkSearchEditor({ exhibitionId }: { exhibitionId: number }) {
  const { data: exhibition, error: loadError, retry: retryLoad, replace } = useExhibition(exhibitionId, getExhibition)
  const [query, setQuery] = useState('')
  const [queryError, setQueryError] = useState('')
  const [results, setResults] = useState<MuseumArtworkSearchPage | null>(null)
  const [activeQuery, setActiveQuery] = useState('')
  const [searchError, setSearchError] = useState<FrontendError | Error | null>(null)
  const [searching, setSearching] = useState(false)
  const [addingExternalId, setAddingExternalId] = useState<string | null>(null)
  const [addError, setAddError] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [capacityReached, setCapacityReached] = useState(false)
  const [duplicateArtworkKeys, setDuplicateArtworkKeys] = useState<Set<string>>(() => new Set())
  const searchController = useRef<AbortController | null>(null)
  const addController = useRef<AbortController | null>(null)
  const searchRequest = useRef(0)
  const lastSearch = useRef<{ query: string; page: number } | null>(null)

  useEffect(() => () => {
    searchController.current?.abort()
    addController.current?.abort()
  }, [])

  if (!exhibition || exhibition.id !== exhibitionId) {
    if (!loadError) return <LoadingState label="Loading exhibition artworks…" />
    if (isFrontendError(loadError) && loadError.status === 404) {
      return <ExhibitionNotFound onRetry={retryLoad} />
    }
    return <ExhibitionLoadError error={loadError} onRetry={retryLoad} />
  }

  const currentExhibition = exhibition
  const isReadOnly = readOnly || currentExhibition.status === 'PUBLISHED'
  const atCapacity = capacityReached || currentExhibition.items.length >= 10
  const committedArtworkKeys = new Set(currentExhibition.items.map((item) => artworkKey(item.artwork)))

  function changeQuery(value: string) {
    setQuery(value)
    setQueryError('')
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      setQueryError('Search query must be between 2 and 100 characters.')
      return
    }
    setQuery(normalizedQuery)
    startSearch(normalizedQuery, 1)
  }

  async function startSearch(normalizedQuery: string, page: number) {
    searchController.current?.abort()
    const controller = new AbortController()
    const request = searchRequest.current + 1
    searchRequest.current = request
    searchController.current = controller
    lastSearch.current = { query: normalizedQuery, page }
    setSearching(true)
    setSearchError(null)
    setQueryError('')
    try {
      const pageResult = await searchMuseumArtworks(
        normalizedQuery,
        page,
        SEARCH_PAGE_SIZE,
        controller.signal,
      )
      if (!controller.signal.aborted && request === searchRequest.current) {
        setResults(pageResult)
        setActiveQuery(normalizedQuery)
      }
    } catch (reason) {
      if (!controller.signal.aborted && request === searchRequest.current) {
        const error = reason instanceof Error ? reason : new Error('Unknown error')
        if (isFrontendError(error)) {
          const fieldError = error.fieldErrors.find((candidate) => candidate.field === 'q')
          if (fieldError) setQueryError(fieldError.message)
        }
        setSearchError(error)
      }
    } finally {
      if (!controller.signal.aborted && request === searchRequest.current) {
        setSearching(false)
      }
    }
  }

  function retrySearch() {
    const previousSearch = lastSearch.current
    if (previousSearch) startSearch(previousSearch.query, previousSearch.page)
  }

  async function addArtwork(artwork: MuseumArtworkSearchResult) {
    const key = artworkKey(artwork)
    if (isReadOnly || atCapacity || addingExternalId !== null || committedArtworkKeys.has(key) || duplicateArtworkKeys.has(key)) {
      return
    }
    const controller = new AbortController()
    addController.current = controller
    setAddingExternalId(artwork.externalId)
    setAddError('')
    try {
      const addedItem = await addExhibitionArtwork(currentExhibition.id, artwork, controller.signal)
      if (!controller.signal.aborted) {
        replace(withAddedItem(currentExhibition, addedItem))
      }
    } catch (reason) {
      if (!controller.signal.aborted) handleAddError(reason, artwork, key)
    } finally {
      if (!controller.signal.aborted) setAddingExternalId(null)
    }
  }

  function handleAddError(reason: unknown, artwork: MuseumArtworkSearchResult, key: string) {
    const error = reason instanceof Error ? reason : new Error('Unknown error')
    if (isFrontendError(error)) {
      if (error.code === 'DUPLICATE_EXHIBITION_ARTWORK') {
        setDuplicateArtworkKeys((current) => new Set(current).add(key))
        setAddError(`${artwork.title} is already in this exhibition.`)
        return
      }
      if (error.code === 'EXHIBITION_ARTWORK_LIMIT_REACHED') {
        setCapacityReached(true)
        setAddError('This exhibition already has the maximum of 10 artworks.')
        return
      }
      if (error.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
        setReadOnly(true)
        return
      }
      if (error.code === 'MUSEUM_SERVICE_UNAVAILABLE') {
        setAddError('The museum service is temporarily unavailable. Try adding this artwork again.')
        return
      }
      if (error.code === 'ARTWORK_NOT_IMPORTABLE') {
        setAddError(error.message)
        return
      }
      setAddError(error.message)
      return
    }
    setAddError('An unexpected problem occurred while adding the artwork. Please try again.')
  }

  return (
    <section className="artwork-search-page">
      <div className="page-heading editor-heading">
        <p className="eyebrow">Museum collection</p>
        <h1>Add artworks</h1>
        <p className="lede">Search the collection and add public-domain works to {currentExhibition.title}.</p>
      </div>
      <nav className="editor-links" aria-label="Exhibition actions">
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/edit`}>Back to exhibition</Link>
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/preview`}>Preview exhibition</Link>
      </nav>
      <section className="artwork-search-section" aria-labelledby="current-artworks-heading">
        <h2 id="current-artworks-heading">Current artworks ({currentExhibition.items.length}/10)</h2>
        {currentExhibition.items.length === 0 ? (
          <p className="section-copy">No artworks have been added yet.</p>
        ) : (
          <ol className="current-artwork-list">
            {currentExhibition.items.map((item) => (
              <li key={item.id}>
                <span>{item.position}.</span> {item.artwork.title}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="artwork-search-section" aria-labelledby="museum-search-heading">
        <h2 id="museum-search-heading">Search museum collection</h2>
        {isReadOnly && <p className="form-alert" role="status">This exhibition is published and read-only.</p>}
        {atCapacity && <p className="form-alert" role="status">This exhibition has reached its 10-artwork limit.</p>}
        {addError && <p className="form-alert" role="alert">{addError}</p>}
        <form className="museum-search-form" onSubmit={submitSearch} noValidate aria-busy={searching}>
          <label htmlFor="museum-query">Search terms</label>
          <div className="museum-search-form__controls">
            <input
              id="museum-query"
              name="q"
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              aria-invalid={Boolean(queryError)}
              aria-describedby={queryError ? 'museum-query-error' : undefined}
            />
            <button className="button" type="submit">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {queryError && <p className="field-error" id="museum-query-error">{queryError}</p>}
        </form>
        {searchError && <SearchError error={searchError} onRetry={retrySearch} />}
        <SearchContent
          results={results}
          activeQuery={activeQuery}
          searching={searching}
          onPageChange={startSearch}
          onAdd={addArtwork}
          isReadOnly={isReadOnly}
          atCapacity={atCapacity}
          addingExternalId={addingExternalId}
          isAlreadyAdded={(artwork) => {
            const key = artworkKey(artwork)
            return committedArtworkKeys.has(key) || duplicateArtworkKeys.has(key)
          }}
        />
      </section>
    </section>
  )
}

function SearchContent({
  results,
  activeQuery,
  searching,
  onPageChange,
  onAdd,
  isReadOnly,
  atCapacity,
  addingExternalId,
  isAlreadyAdded,
}: {
  results: MuseumArtworkSearchPage | null
  activeQuery: string
  searching: boolean
  onPageChange: (query: string, page: number) => void
  onAdd: (artwork: MuseumArtworkSearchResult) => void
  isReadOnly: boolean
  atCapacity: boolean
  addingExternalId: string | null
  isAlreadyAdded: (artwork: MuseumArtworkSearchResult) => boolean
}) {
  if (searching && !results) return <LoadingState label="Searching the museum collection…" />
  if (!results) {
    return <EmptyState title="Search the collection">Enter at least two characters to find artworks.</EmptyState>
  }
  if (results.items.length === 0) {
    return (
      <div className="museum-results" aria-live="polite">
        <EmptyState title="No artworks found">Try a different search term or continue to another page.</EmptyState>
        <SearchPagination
          results={results}
          activeQuery={activeQuery}
          searching={searching}
          onPageChange={onPageChange}
        />
      </div>
    )
  }

  return (
    <div className="museum-results" aria-live="polite">
      <p className="results-count">{results.items.length} {results.items.length === 1 ? 'result' : 'results'} on page {results.page}</p>
      <div className="museum-results__grid">
        {results.items.map((artwork) => {
          const alreadyAdded = isAlreadyAdded(artwork)
          const disabled = alreadyAdded || isReadOnly || atCapacity || addingExternalId !== null
          return (
            <article className="museum-artwork-card" key={artworkKey(artwork)}>
              {artwork.thumbnailUrl ? (
                <img className="museum-artwork-card__image" src={artwork.thumbnailUrl} alt={`Thumbnail of ${artwork.title}`} />
              ) : (
                <div className="museum-artwork-card__image placeholder-image" role="img" aria-label={`No thumbnail available for ${artwork.title}`} />
              )}
              <div className="museum-artwork-card__body">
                <h3>{artwork.title}</h3>
                <p>{artwork.artistDisplay || 'Artist unknown'}</p>
                {artwork.dateDisplay && <p>{artwork.dateDisplay}</p>}
                {artwork.mediumDisplay && <p>{artwork.mediumDisplay}</p>}
                <p className="artwork-card__status">Public domain</p>
                {alreadyAdded ? (
                  <p className="artwork-card__added" role="status">Already added</p>
                ) : (
                  <button className="button" type="button" disabled={disabled} onClick={() => onAdd(artwork)}>
                    {addingExternalId === artwork.externalId ? 'Adding…' : 'Add artwork'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <SearchPagination
        results={results}
        activeQuery={activeQuery}
        searching={searching}
        onPageChange={onPageChange}
      />
    </div>
  )
}

function SearchPagination({
  results,
  activeQuery,
  searching,
  onPageChange,
}: {
  results: MuseumArtworkSearchPage
  activeQuery: string
  searching: boolean
  onPageChange: (query: string, page: number) => void
}) {
  return (
    <nav className="search-pagination" aria-label="Search result pages">
      <button className="button button-secondary" type="button" disabled={searching || results.page <= 1} onClick={() => onPageChange(activeQuery, results.page - 1)}>
        Previous page
      </button>
      <button className="button button-secondary" type="button" disabled={searching || !results.hasNextPage} onClick={() => onPageChange(activeQuery, results.page + 1)}>
        Next page
      </button>
    </nav>
  )
}

function SearchError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const providerUnavailable = isFrontendError(error) && error.code === 'MUSEUM_SERVICE_UNAVAILABLE'
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred while searching. Please try again.'
  return (
    <section className="search-error" role="alert">
      <p>{providerUnavailable ? 'The museum service is temporarily unavailable.' : message}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
    </section>
  )
}

function withAddedItem(exhibition: ExhibitionDetail, addedItem: ExhibitionDetail['items'][number]): ExhibitionDetail {
  return {
    ...exhibition,
    items: [...exhibition.items, addedItem].sort((first, second) => first.position - second.position),
  }
}

function artworkKey(artwork: Pick<MuseumArtworkSearchResult, 'source' | 'externalId'>): string {
  return `${artwork.source}:${artwork.externalId}`
}

function parseExhibitionId(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null
  const exhibitionId = Number(id)
  return Number.isSafeInteger(exhibitionId) && exhibitionId > 0 ? exhibitionId : null
}

function InvalidExhibitionRoute() {
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Invalid address</p>
      <h1>Invalid exhibition address</h1>
      <p>Use an exhibition address from your curator workspace.</p>
      <Link className="text-link" to="/exhibitions">Return to exhibitions</Link>
    </section>
  )
}

function ExhibitionNotFound({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Not found</p>
      <h1>Exhibition not found</h1>
      <p>This exhibition may have been deleted or the address may be incorrect.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
      <Link className="text-link" to="/exhibitions">Return to exhibitions</Link>
    </section>
  )
}

function ExhibitionLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred. Please try again.'
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>We could not load this exhibition</h1>
      <p>{message}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
    </section>
  )
}
