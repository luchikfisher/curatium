import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isFrontendError, type FrontendError } from '../api/errors'
import { EmptyState, LoadingState } from '../components/AsyncState'
import { ArtworkImage } from '../components/ArtworkImage'
import {
  AuthoritativeReconciliationNotice,
  type AuthoritativeReconciliationPhase,
} from '../features/exhibitions/AuthoritativeReconciliationNotice'
import {
  DirtyNavigationConfirmation,
} from '../features/exhibitions/DirtyNavigationGuard'
import { useDirtyNavigation } from '../features/exhibitions/useDirtyNavigation'
import {
  addExhibitionArtwork,
  clearExhibitionCover,
  getExhibition,
  moveExhibitionItem,
  removeExhibitionItem,
  searchMuseumArtworks,
  selectExhibitionCover,
  updateExhibitionItemNote,
} from '../features/exhibitions/api'
import { useExhibition } from '../features/exhibitions/useExhibition'
import type {
  ExhibitionDetail,
  ExhibitionItem,
  MuseumArtworkSearchPage,
  MuseumArtworkSearchResult,
} from '../features/exhibitions/types'

const SEARCH_PAGE_SIZE = 20
const MAXIMUM_CURATORIAL_NOTE_LENGTH = 2000

type ItemMutationKind = 'note' | 'move-up' | 'move-down' | 'remove'

type CoverMutation =
  | { kind: 'select'; itemId: number }
  | { kind: 'clear' }

interface ItemMutation {
  itemId: number
  kind: ItemMutationKind
}

interface NoteDraft {
  baseline: string
  value: string
}

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
  const [noteDrafts, setNoteDrafts] = useState<Record<number, NoteDraft>>({})
  const [noteErrors, setNoteErrors] = useState<Record<number, string | undefined>>({})
  const [itemError, setItemError] = useState('')
  const [itemSuccess, setItemSuccess] = useState('')
  const [itemMutation, setItemMutation] = useState<ItemMutation | null>(null)
  const [coverMutation, setCoverMutation] = useState<CoverMutation | null>(null)
  const [coverError, setCoverError] = useState('')
  const [coverSuccess, setCoverSuccess] = useState('')
  const [removingItemId, setRemovingItemId] = useState<number | null>(null)
  const [exhibitionNotFound, setExhibitionNotFound] = useState(false)
  const [reconciliationPhase, setReconciliationPhase] = useState<AuthoritativeReconciliationPhase>('idle')
  const searchController = useRef<AbortController | null>(null)
  const addController = useRef<AbortController | null>(null)
  const itemMutationController = useRef<AbortController | null>(null)
  const coverMutationController = useRef<AbortController | null>(null)
  const reconciliationController = useRef<AbortController | null>(null)
  const authoringRegionRef = useRef<HTMLElement | null>(null)
  const reconciliationFocusOrigin = useRef<HTMLElement | null>(null)
  const searchRequest = useRef(0)
  const lastSearch = useRef<{ query: string; page: number } | null>(null)
  const confirmRemovalButtonRef = useRef<HTMLButtonElement | null>(null)
  const removeButtonRefs = useRef(new Map<number, HTMLButtonElement>())
  const restoreRemovalFocus = useRef<number | null>(null)
  const dirtyNavigation = useDirtyNavigation(
    Object.values(noteDrafts).some((draft) => draft.value !== draft.baseline),
  )

  useEffect(() => () => {
    searchController.current?.abort()
    addController.current?.abort()
    itemMutationController.current?.abort()
    coverMutationController.current?.abort()
    reconciliationController.current?.abort()
  }, [])
  useEffect(() => {
    if (removingItemId !== null) {
      confirmRemovalButtonRef.current?.focus()
    } else if (restoreRemovalFocus.current !== null) {
      removeButtonRefs.current.get(restoreRemovalFocus.current)?.focus()
      restoreRemovalFocus.current = null
    }
  }, [removingItemId])

  if (exhibitionNotFound) {
    return (
      <ExhibitionNotFound
        onRetry={() => {
          setExhibitionNotFound(false)
          retryLoad()
        }}
      />
    )
  }

  if (!exhibition || exhibition.id !== exhibitionId) {
    if (!loadError) return <LoadingState label="Loading exhibition artworks…" />
    if (isFrontendError(loadError) && loadError.status === 404) {
      return <ExhibitionNotFound onRetry={retryLoad} />
    }
    return <ExhibitionLoadError error={loadError} onRetry={retryLoad} />
  }

  const currentExhibition = exhibition
  const isReadOnly = readOnly || currentExhibition.status === 'PUBLISHED'
  const authoringLocked = isReadOnly || reconciliationPhase === 'loading' || reconciliationPhase === 'failed'
  const atCapacity = capacityReached || currentExhibition.items.length >= 10
  const itemMutationInProgress = itemMutation !== null
  const coverMutationInProgress = coverMutation !== null
  const committedArtworkKeys = new Set(currentExhibition.items.map((item) => artworkKey(item.artwork)))
  const coverItem = currentExhibition.coverArtworkId === null
    ? null
    : currentExhibition.items.find((item) => item.artwork.id === currentExhibition.coverArtworkId) ?? null

  function replaceExhibition(nextExhibition: ExhibitionDetail) {
    const retainedItemIds = new Set(nextExhibition.items.map((item) => item.id))
    setNoteDrafts((current) => {
      const retained = Object.fromEntries(
        Object.entries(current).filter(([itemId]) => retainedItemIds.has(Number(itemId))),
      )
      return Object.keys(retained).length === Object.keys(current).length ? current : retained
    })
    replace(nextExhibition)
  }

  function replaceAuthoritativeExhibition(nextExhibition: ExhibitionDetail) {
    replace(nextExhibition)
    setNoteDrafts({})
    setNoteErrors({})
    setCapacityReached(nextExhibition.items.length >= 10)
    setDuplicateArtworkKeys(new Set())
    setAddingExternalId(null)
    setAddError('')
    setItemError('')
    setItemSuccess('')
    setCoverError('')
    setCoverSuccess('')
    setRemovingItemId(null)
    restoreRemovalFocus.current = null
  }

  async function reconcilePublishedConflict() {
    const activeElement = document.activeElement
    reconciliationFocusOrigin.current = activeElement instanceof HTMLElement
      && authoringRegionRef.current?.contains(activeElement)
      ? activeElement
      : null
    reconciliationController.current?.abort()
    const controller = new AbortController()
    reconciliationController.current = controller
    setReconciliationPhase('loading')
    setReadOnly(true)
    setRemovingItemId(null)
    try {
      const committedExhibition = await getExhibition(currentExhibition.id, controller.signal)
      if (controller.signal.aborted || reconciliationController.current !== controller) return
      replaceAuthoritativeExhibition(committedExhibition)
      setReadOnly(committedExhibition.status === 'PUBLISHED')
      setReconciliationPhase('reconciled')
    } catch (reason) {
      if (!controller.signal.aborted && reconciliationController.current === controller && !isAbortError(reason)) {
        setReadOnly(true)
        setReconciliationPhase('failed')
      }
    }
  }

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
    if (authoringLocked || atCapacity || itemMutationInProgress || coverMutationInProgress || addingExternalId !== null || committedArtworkKeys.has(key) || duplicateArtworkKeys.has(key)) {
      return
    }
    const controller = new AbortController()
    addController.current = controller
    setAddingExternalId(artwork.externalId)
    setAddError('')
    try {
      const addedItem = await addExhibitionArtwork(currentExhibition.id, artwork, controller.signal)
      if (isCurrentAddRequest(controller)) {
        replaceExhibition(withAddedItem(currentExhibition, addedItem))
      }
    } catch (reason) {
      if (isCurrentAddRequest(controller)) {
        await handleAddError(reason, artwork, key, controller)
      }
    } finally {
      if (isCurrentAddRequest(controller)) setAddingExternalId(null)
    }
  }

  function isCurrentAddRequest(controller: AbortController) {
    return !controller.signal.aborted && addController.current === controller
  }

  async function handleAddError(
    reason: unknown,
    artwork: MuseumArtworkSearchResult,
    key: string,
    controller: AbortController,
  ) {
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
        try {
          const refreshedExhibition = await getExhibition(
            currentExhibition.id,
            controller.signal,
          )
          if (isCurrentAddRequest(controller)) {
            replaceExhibition(refreshedExhibition)
            setCapacityReached(refreshedExhibition.items.length >= 10)
          }
        } catch (refreshReason) {
          if (isCurrentAddRequest(controller) && !isAbortError(refreshReason)) {
            setAddError(
              'This exhibition is at capacity. The displayed artwork list could not be refreshed and may be stale. Reload this page to see the latest artworks.',
            )
          }
        }
        return
      }
      if (error.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
        await reconcilePublishedConflict()
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

  function beginCoverMutation(mutation: CoverMutation): AbortController | null {
    if (authoringLocked || coverMutationInProgress || itemMutationInProgress || addingExternalId !== null) return null
    const controller = new AbortController()
    coverMutationController.current = controller
    setCoverMutation(mutation)
    setCoverError('')
    setCoverSuccess('')
    return controller
  }

  function isCurrentCoverMutation(controller: AbortController) {
    return !controller.signal.aborted && coverMutationController.current === controller
  }

  async function handleCoverMutationError(reason: unknown) {
    const error = reason instanceof Error ? reason : new Error('Unknown error')
    if (isFrontendError(error)) {
      if (error.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
        await reconcilePublishedConflict()
        return
      }
      if (error.code === 'EXHIBITION_NOT_FOUND') {
        setExhibitionNotFound(true)
        return
      }
      if (error.code === 'INVALID_COVER_ARTWORK') {
        setCoverError(error.message)
        return
      }
      setCoverError(error.message)
      return
    }
    setCoverError('An unexpected problem occurred while updating the cover. Please try again.')
  }

  async function selectCover(item: ExhibitionItem) {
    const controller = beginCoverMutation({ kind: 'select', itemId: item.id })
    if (!controller) return
    try {
      const updatedExhibition = await selectExhibitionCover(
        currentExhibition.id,
        item.artwork.id,
        controller.signal,
      )
      if (isCurrentCoverMutation(controller)) {
        replaceExhibition(updatedExhibition)
        setCoverSuccess('Cover updated.')
      }
    } catch (reason) {
      if (isCurrentCoverMutation(controller)) await handleCoverMutationError(reason)
    } finally {
      if (isCurrentCoverMutation(controller)) setCoverMutation(null)
    }
  }

  async function clearCover() {
    const controller = beginCoverMutation({ kind: 'clear' })
    if (!controller) return
    try {
      const updatedExhibition = await clearExhibitionCover(
        currentExhibition.id,
        controller.signal,
      )
      if (isCurrentCoverMutation(controller)) {
        replaceExhibition(updatedExhibition)
        setCoverSuccess('Cover cleared.')
      }
    } catch (reason) {
      if (isCurrentCoverMutation(controller)) await handleCoverMutationError(reason)
    } finally {
      if (isCurrentCoverMutation(controller)) setCoverMutation(null)
    }
  }

  function noteValue(item: ExhibitionItem): string {
    return noteDrafts[item.id]?.value ?? item.curatorialNote ?? ''
  }

  function changeNote(itemId: number, value: string) {
    const item = currentExhibition.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    setNoteDrafts((current) => {
      const baseline = current[itemId]?.baseline ?? item.curatorialNote ?? ''
      if (value === baseline) {
        const remaining = { ...current }
        delete remaining[itemId]
        return remaining
      }
      return { ...current, [itemId]: { baseline, value } }
    })
    setNoteErrors((current) => ({ ...current, [itemId]: undefined }))
    setItemError('')
    setItemSuccess('')
  }

  function beginItemMutation(itemId: number, kind: ItemMutationKind): AbortController | null {
    if (authoringLocked || itemMutationController.current !== null || itemMutationInProgress || coverMutationInProgress || addingExternalId !== null) return null
    const controller = new AbortController()
    itemMutationController.current = controller
    setItemMutation({ itemId, kind })
    setItemError('')
    setItemSuccess('')
    return controller
  }

  function isCurrentItemMutation(controller: AbortController) {
    return !controller.signal.aborted && itemMutationController.current === controller
  }

  function clearNoteDraft(itemId: number) {
    setNoteDrafts((current) => {
      const remaining = { ...current }
      delete remaining[itemId]
      return remaining
    })
    setNoteErrors((current) => {
      const remaining = { ...current }
      delete remaining[itemId]
      return remaining
    })
  }

  async function handleItemMutationError(reason: unknown, itemId: number) {
    const error = reason instanceof Error ? reason : new Error('Unknown error')
    if (isFrontendError(error)) {
      if (error.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
        await reconcilePublishedConflict()
        return
      }
      const noteFieldError = error.fieldErrors.find((fieldError) => fieldError.field === 'curatorialNote')
      if (noteFieldError) {
        setNoteErrors((current) => ({ ...current, [itemId]: noteFieldError.message }))
        return
      }
      if (error.code === 'EXHIBITION_NOT_FOUND') {
        setRemovingItemId(null)
        setExhibitionNotFound(true)
        return
      }
      if (error.code === 'EXHIBITION_ITEM_NOT_FOUND') {
        setRemovingItemId(null)
        setItemError('This artwork is no longer available in this exhibition. Refresh the page to see the latest items.')
        return
      }
      setItemError(error.message)
      return
    }
    setItemError('An unexpected problem occurred while updating this artwork. Please try again.')
  }

  async function saveNote(item: ExhibitionItem, value = noteValue(item)) {
    if (value.length > MAXIMUM_CURATORIAL_NOTE_LENGTH) {
      setNoteErrors((current) => ({
        ...current,
        [item.id]: `Curatorial note must be at most ${MAXIMUM_CURATORIAL_NOTE_LENGTH} characters.`,
      }))
      return
    }
    const controller = beginItemMutation(item.id, 'note')
    if (!controller) return
    try {
      const updatedItem = await updateExhibitionItemNote(
        currentExhibition.id,
        item.id,
        value,
        controller.signal,
      )
      if (isCurrentItemMutation(controller)) {
        replaceExhibition(withReplacedItem(currentExhibition, updatedItem))
        clearNoteDraft(item.id)
        setItemSuccess(value.trim() ? 'Curatorial note saved.' : 'Curatorial note cleared.')
      }
    } catch (reason) {
      if (isCurrentItemMutation(controller)) await handleItemMutationError(reason, item.id)
    } finally {
      if (isCurrentItemMutation(controller)) {
        itemMutationController.current = null
        setItemMutation(null)
      }
    }
  }

  async function moveItem(item: ExhibitionItem, direction: 'up' | 'down') {
    const controller = beginItemMutation(item.id, `move-${direction}`)
    if (!controller) return
    try {
      const orderedItems = await moveExhibitionItem(
        currentExhibition.id,
        item.id,
        direction,
        controller.signal,
      )
      if (isCurrentItemMutation(controller)) {
        replaceExhibition(withItems(currentExhibition, orderedItems))
        setItemSuccess(`Artwork moved ${direction}.`)
      }
    } catch (reason) {
      if (isCurrentItemMutation(controller)) await handleItemMutationError(reason, item.id)
    } finally {
      if (isCurrentItemMutation(controller)) {
        itemMutationController.current = null
        setItemMutation(null)
      }
    }
  }

  function requestRemoval(itemId: number) {
    if (authoringLocked || itemMutationInProgress || coverMutationInProgress || addingExternalId !== null) return
    setItemError('')
    setItemSuccess('')
    setRemovingItemId(itemId)
  }

  function cancelRemoval() {
    restoreRemovalFocus.current = removingItemId
    setRemovingItemId(null)
  }

  async function removeItem(item: ExhibitionItem) {
    const controller = beginItemMutation(item.id, 'remove')
    if (!controller) return
    try {
      const committedExhibition = await removeExhibitionItem(currentExhibition.id, item.id, controller.signal)
      if (isCurrentItemMutation(controller)) {
        replaceExhibition(committedExhibition)
        setCapacityReached(committedExhibition.items.length >= 10)
        setDuplicateArtworkKeys(new Set())
        setAddError('')
        clearNoteDraft(item.id)
        removeButtonRefs.current.delete(item.id)
        restoreRemovalFocus.current = null
        setRemovingItemId(null)
        setItemError('')
        setItemSuccess('Artwork removed.')
      }
    } catch (reason) {
      if (isCurrentItemMutation(controller)) await handleItemMutationError(reason, item.id)
    } finally {
      if (isCurrentItemMutation(controller)) {
        itemMutationController.current = null
        setItemMutation(null)
      }
    }
  }

  return (
    <section ref={authoringRegionRef} className="artwork-search-page">
      <div className="page-heading editor-heading">
        <p className="eyebrow">Museum collection</p>
        <h1>Add artworks</h1>
        <p className="lede">Search the collection and add public-domain works to {currentExhibition.title}.</p>
      </div>
      <nav className="editor-links" aria-label="Exhibition actions">
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/edit`}>Back to exhibition</Link>
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/preview`}>Preview exhibition</Link>
      </nav>
      <AuthoritativeReconciliationNotice
        phase={reconciliationPhase}
        onRetry={reconcilePublishedConflict}
        initialFocusOriginRef={reconciliationFocusOrigin}
      />
      <section className="artwork-search-section cover-selection" aria-labelledby="cover-heading">
        <h2 id="cover-heading">Cover artwork</h2>
        {coverItem ? (
          <div className="cover-selection__current">
            <ArtworkImage
              src={coverItem.artwork.thumbnailUrl}
              alt={`Current cover: ${coverItem.artwork.title}`}
              className="cover-selection__image"
            />
            <div>
              <p className="cover-selection__status" role="status">Current cover</p>
              <p>{coverItem.artwork.title}</p>
              <button
                aria-label={`Clear cover, artwork ${coverItem.position} of ${currentExhibition.items.length}, ${coverItem.artwork.title}`}
                className="button button-secondary"
                type="button"
                disabled={authoringLocked || coverMutationInProgress || itemMutationInProgress || addingExternalId !== null}
                onClick={clearCover}
              >
                {coverMutation?.kind === 'clear' ? 'Clearing…' : 'Clear cover'}
              </button>
            </div>
          </div>
        ) : (
          <p className="section-copy">No cover selected. Choose an artwork below to use as the exhibition cover.</p>
        )}
        {coverError && <p className="form-alert" role="alert">{coverError}</p>}
        {coverSuccess && <p className="form-success" role="status">{coverSuccess}</p>}
      </section>
      <section className="artwork-search-section" aria-labelledby="current-artworks-heading">
        <h2 id="current-artworks-heading">Current artworks ({currentExhibition.items.length}/10)</h2>
        {isReadOnly && <p className="form-alert" role="status">This exhibition is published and read-only.</p>}
        {itemError && <p className="form-alert" role="alert">{itemError}</p>}
        {itemSuccess && <p className="form-success" role="status">{itemSuccess}</p>}
        {currentExhibition.items.length === 0 ? (
          <p className="section-copy">No artworks have been added yet.</p>
        ) : (
          <ol className="current-artwork-list current-artwork-list--curation">
            {currentExhibition.items.map((item) => (
              <CurrentArtworkItem
                key={item.id}
                item={item}
                itemCount={currentExhibition.items.length}
                note={noteValue(item)}
                noteError={noteErrors[item.id]}
                isReadOnly={authoringLocked}
                isBusy={itemMutationInProgress}
                coverMutation={coverMutation}
                hasCurrentCover={coverItem !== null}
                isCurrentCover={item.artwork.id === currentExhibition.coverArtworkId}
                activeMutationKind={
                  itemMutation?.itemId === item.id ? itemMutation.kind : null
                }
                isConfirmingRemoval={removingItemId === item.id}
                onNoteChange={changeNote}
                onSaveNote={saveNote}
                onMove={moveItem}
                onSelectCover={selectCover}
                onRequestRemoval={requestRemoval}
                onRemove={removeItem}
                onCancelRemoval={cancelRemoval}
                removeButtonRef={(button) => {
                  if (button) removeButtonRefs.current.set(item.id, button)
                  else removeButtonRefs.current.delete(item.id)
                }}
                confirmRemovalButtonRef={confirmRemovalButtonRef}
              />
            ))}
          </ol>
        )}
      </section>
      <section className="artwork-search-section" aria-labelledby="museum-search-heading">
        <h2 id="museum-search-heading">Search museum collection</h2>
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
          isReadOnly={authoringLocked}
          atCapacity={atCapacity}
          addingExternalId={addingExternalId}
          itemMutationInProgress={itemMutationInProgress}
          coverMutationInProgress={coverMutationInProgress}
          isAlreadyAdded={(artwork) => {
            const key = artworkKey(artwork)
            return committedArtworkKeys.has(key) || duplicateArtworkKeys.has(key)
          }}
        />
      </section>
      <DirtyNavigationConfirmation navigation={dirtyNavigation} />
    </section>
  )
}

function CurrentArtworkItem({
  item,
  itemCount,
  note,
  noteError,
  isReadOnly,
  isBusy,
  coverMutation,
  hasCurrentCover,
  isCurrentCover,
  activeMutationKind,
  isConfirmingRemoval,
  onNoteChange,
  onSaveNote,
  onMove,
  onSelectCover,
  onRequestRemoval,
  onRemove,
  onCancelRemoval,
  removeButtonRef,
  confirmRemovalButtonRef,
}: {
  item: ExhibitionItem
  itemCount: number
  note: string
  noteError?: string
  isReadOnly: boolean
  isBusy: boolean
  coverMutation: CoverMutation | null
  hasCurrentCover: boolean
  isCurrentCover: boolean
  activeMutationKind: ItemMutationKind | null
  isConfirmingRemoval: boolean
  onNoteChange: (itemId: number, value: string) => void
  onSaveNote: (item: ExhibitionItem, value?: string) => void
  onMove: (item: ExhibitionItem, direction: 'up' | 'down') => void
  onSelectCover: (item: ExhibitionItem) => void
  onRequestRemoval: (itemId: number) => void
  onRemove: (item: ExhibitionItem) => void
  onCancelRemoval: () => void
  removeButtonRef: (button: HTMLButtonElement | null) => void
  confirmRemovalButtonRef: React.RefObject<HTMLButtonElement | null>
}) {
  const noteId = `curatorial-note-${item.id}`
  const noteErrorId = `${noteId}-error`
  const disabled = isReadOnly || isBusy || coverMutation !== null
  const isSaving = activeMutationKind === 'note'
  const isMovingUp = activeMutationKind === 'move-up'
  const isMovingDown = activeMutationKind === 'move-down'
  const isRemoving = activeMutationKind === 'remove'
  const canClearNote = note.length > 0 || item.curatorialNote !== null
  const artworkDescriptor = `artwork ${item.position} of ${itemCount}, ${item.artwork.title}`
  const isSettingCover = coverMutation?.kind === 'select' && coverMutation.itemId === item.id

  function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSaveNote(item)
  }

  return (
    <li className="current-artwork-item">
      <article aria-labelledby={`artwork-item-${item.id}-title`}>
        <div className="current-artwork-item__summary">
          <ArtworkImage
            src={item.artwork.thumbnailUrl}
            alt={`Thumbnail of ${item.artwork.title}`}
            className="current-artwork-item__image"
          />
          <div>
            <p className="current-artwork-item__position">Artwork {item.position} of {itemCount}</p>
            <h3 id={`artwork-item-${item.id}-title`}>{item.artwork.title}</h3>
            <p>{item.artwork.artistDisplay || 'Artist unknown'}</p>
          </div>
        </div>
        <form className="curatorial-note-form" onSubmit={submitNote} aria-busy={isSaving}>
          <label htmlFor={noteId}>Curatorial note for artwork {item.position} of {itemCount}: {item.artwork.title}</label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => onNoteChange(item.id, event.target.value)}
            maxLength={MAXIMUM_CURATORIAL_NOTE_LENGTH + 1}
            disabled={disabled}
            aria-invalid={Boolean(noteError)}
            aria-describedby={noteError ? noteErrorId : undefined}
          />
          {noteError && <p className="field-error" id={noteErrorId}>{noteError}</p>}
          <div className="current-artwork-item__actions">
            <button aria-label={isSaving ? `Saving note for ${artworkDescriptor}` : `Save note for ${artworkDescriptor}`} className="button button-secondary" type="submit" disabled={disabled}>
              {isSaving ? 'Saving…' : 'Save note'}
            </button>
            <button aria-label={`Clear note for ${artworkDescriptor}`} className="button button-secondary" type="button" disabled={disabled || !canClearNote} onClick={() => onSaveNote(item, '')}>
              Clear note
            </button>
          </div>
        </form>
        <div className="current-artwork-item__actions">
          {isCurrentCover ? (
            <p className="current-artwork-item__cover" role="status">Current cover</p>
          ) : (
            <button
              aria-label={isSettingCover
                ? `Setting cover to ${artworkDescriptor}`
                : hasCurrentCover
                  ? `Replace cover with ${artworkDescriptor}`
                  : `Set ${artworkDescriptor} as cover`}
              className="button button-secondary"
              type="button"
              disabled={disabled}
              onClick={() => onSelectCover(item)}
            >
              {isSettingCover ? 'Setting cover…' : hasCurrentCover ? 'Replace cover' : 'Set as cover'}
            </button>
          )}
          <button aria-label={isMovingUp ? `Moving ${artworkDescriptor} up` : `Move ${artworkDescriptor} up`} className="button button-secondary" type="button" disabled={disabled || item.position === 1} onClick={() => onMove(item, 'up')}>
            {isMovingUp ? 'Moving…' : 'Move up'}
          </button>
          <button aria-label={isMovingDown ? `Moving ${artworkDescriptor} down` : `Move ${artworkDescriptor} down`} className="button button-secondary" type="button" disabled={disabled || item.position === itemCount} onClick={() => onMove(item, 'down')}>
            {isMovingDown ? 'Moving…' : 'Move down'}
          </button>
          {!isConfirmingRemoval ? (
            <button aria-label={`Remove ${artworkDescriptor} from exhibition`} ref={removeButtonRef} className="button button-danger" type="button" disabled={disabled} onClick={() => onRequestRemoval(item.id)}>
              Remove artwork
            </button>
          ) : (
            <div className="item-removal-confirmation" role="alert">
              <p>Remove {item.artwork.title} from this exhibition? This cannot be undone.</p>
              <button aria-label={isRemoving ? `Removing ${artworkDescriptor}` : `Confirm removal of ${artworkDescriptor}`} ref={confirmRemovalButtonRef} className="button button-danger" type="button" disabled={isBusy} onClick={() => onRemove(item)}>
                {isRemoving ? 'Removing…' : 'Confirm removal'}
              </button>
              <button aria-label={`Keep ${artworkDescriptor} in exhibition`} className="button button-secondary" type="button" disabled={isBusy} onClick={onCancelRemoval}>
                Keep artwork
              </button>
            </div>
          )}
        </div>
      </article>
    </li>
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
  itemMutationInProgress,
  coverMutationInProgress,
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
  itemMutationInProgress: boolean
  coverMutationInProgress: boolean
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
          const disabled = alreadyAdded || isReadOnly || atCapacity || addingExternalId !== null || itemMutationInProgress || coverMutationInProgress
          return (
            <article className="museum-artwork-card" key={artworkKey(artwork)}>
              <ArtworkImage
                src={artwork.thumbnailUrl}
                alt={`Thumbnail of ${artwork.title}`}
                loading="lazy"
                className="museum-artwork-card__image"
              />
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

function withReplacedItem(exhibition: ExhibitionDetail, updatedItem: ExhibitionItem): ExhibitionDetail {
  return {
    ...exhibition,
    items: exhibition.items
      .map((item) => item.id === updatedItem.id ? updatedItem : item)
      .sort((first, second) => first.position - second.position),
  }
}

function withItems(exhibition: ExhibitionDetail, items: ExhibitionItem[]): ExhibitionDetail {
  return {
    ...exhibition,
    items: [...items].sort((first, second) => first.position - second.position),
  }
}

function artworkKey(artwork: Pick<MuseumArtworkSearchResult, 'source' | 'externalId'>): string {
  return `${artwork.source}:${artwork.externalId}`
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
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
