import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArtworkImage } from '../components/ArtworkImage'
import { isFrontendError } from '../api/errors'
import { LoadingState } from '../components/AsyncState'
import { getExhibition, publishExhibition, unpublishExhibition } from '../features/exhibitions/api'
import { useExhibition } from '../features/exhibitions/useExhibition'
import { CuratorExhibitionContext } from '../features/exhibitions/CuratorExhibitionContext'
import { readArtworkSearchReturnTarget } from '../features/exhibitions/artworkSearchNavigation'
import { createCuratorVisitState } from '../features/exhibitions/curatorVisitState'
import type { ExhibitionArtwork, ExhibitionDetail, ExhibitionItem } from '../features/exhibitions/types'
import { LazyExhibitionGallery } from '../features/virtual-gallery/LazyExhibitionGallery'

export function ExhibitionPreviewPage() {
  const { id } = useParams()
  const exhibitionId = parseExhibitionId(id)
  if (exhibitionId === null) return <InvalidExhibitionRoute />
  return <ExhibitionPreview key={id} exhibitionId={exhibitionId} />
}

function ExhibitionPreview({ exhibitionId }: { exhibitionId: number }) {
  const location = useLocation()
  const { data: exhibition, error, retry, replace } = useExhibition(exhibitionId, getExhibition)
  const mutationController = useRef<AbortController | null>(null)
  const mutationInFlight = useRef(false)
  const previewStatusRef = useRef<HTMLParagraphElement | null>(null)
  const authoritativeRefreshFocusPending = useRef(false)
  const [publicationMutation, setPublicationMutation] = useState<'publish' | 'unpublish' | null>(null)
  const [publicationError, setPublicationError] = useState<Error | null>(null)
  const [publicationErrorAction, setPublicationErrorAction] = useState<'publish' | 'unpublish' | null>(null)
  const [publicationSuccess, setPublicationSuccess] = useState<string | null>(null)
  const [publicationNotFound, setPublicationNotFound] = useState(false)
  const [focusPublicationNotFound, setFocusPublicationNotFound] = useState(false)

  useEffect(() => () => mutationController.current?.abort(), [])
  useEffect(() => {
    if (!authoritativeRefreshFocusPending.current || !exhibition || exhibition.id !== exhibitionId) return
    authoritativeRefreshFocusPending.current = false
    previewStatusRef.current?.focus({ preventScroll: true })
  }, [exhibition, exhibitionId])

  const retryPreview = () => {
    setPublicationNotFound(false)
    setFocusPublicationNotFound(false)
    setPublicationError(null)
    retry()
  }

  const clearPublicationFeedback = () => {
    setPublicationError(null)
    setPublicationErrorAction(null)
    setPublicationSuccess(null)
  }

  const transitionPublication = async (action: 'publish' | 'unpublish'): Promise<boolean> => {
    if (mutationInFlight.current) return false

    mutationInFlight.current = true
    const controller = new AbortController()
    mutationController.current = controller
    setPublicationMutation(action)
    setPublicationError(null)
    setPublicationErrorAction(null)
    setPublicationSuccess(null)

    try {
      const committedExhibition = action === 'publish'
        ? await publishExhibition(exhibitionId, controller.signal)
        : await unpublishExhibition(exhibitionId, controller.signal)
      if (controller.signal.aborted) return false
      replace(committedExhibition)
      setPublicationSuccess(action === 'publish'
        ? 'Exhibition published. Curatorial editing is now read-only.'
        : 'Exhibition unpublished. Curatorial editing is available again.')
      return true
    } catch (reason) {
      if (controller.signal.aborted || isAbortError(reason)) return false
      if (isFrontendError(reason) && reason.code === 'EXHIBITION_NOT_FOUND') {
        setFocusPublicationNotFound(true)
        setPublicationNotFound(true)
        return false
      }
      setPublicationErrorAction(action)
      setPublicationError(reason instanceof Error ? reason : new Error('Unknown publication error'))
      if (
        isFrontendError(reason) &&
        (reason.code === 'PUBLISHED_EXHIBITION_READ_ONLY' || reason.code === 'INVALID_PUBLICATION_STATE')
      ) {
        authoritativeRefreshFocusPending.current = true
        retry()
      }
      return false
    } finally {
      if (mutationController.current === controller) {
        mutationInFlight.current = false
        mutationController.current = null
        if (!controller.signal.aborted) setPublicationMutation(null)
      }
    }
  }

  if (publicationNotFound || (!exhibition || exhibition.id !== exhibitionId) && isFrontendError(error) && error.status === 404) {
    return <PreviewNotFound onRetry={retryPreview} focusOnMount={focusPublicationNotFound} />
  }

  if (!exhibition || exhibition.id !== exhibitionId) {
    if (!error) return <LoadingState label="Loading curator preview…" />
    return <PreviewLoadError error={error} onRetry={retryPreview} />
  }

  const orderedItems = [...exhibition.items].sort((first, second) => first.position - second.position)
  const coverItem = exhibition.coverArtworkId === null
    ? null
    : orderedItems.find((item) => item.artwork.id === exhibition.coverArtworkId) ?? null
  const isPublished = exhibition.status === 'PUBLISHED'
  const reconciledUnpublishDraft = !isPublished && publicationErrorAction === 'unpublish'
  const artworkSearchReturnTarget = readArtworkSearchReturnTarget(location.state, exhibitionId)
  const artworksDestination = artworkSearchReturnTarget ?? `/exhibitions/${exhibitionId}/artworks`

  return (
    <section className="exhibition-preview">
      <div className="preview-heading">
        <p className="eyebrow">Curator preview</p>
        <p ref={previewStatusRef} className={`preview-status preview-status--${exhibition.status.toLowerCase()}`} role="status" tabIndex={-1}>
          {isPublished ? 'Published exhibition' : 'Draft preview'}
        </p>
        <h1>{exhibition.title}</h1>
        {exhibition.summary ? <p className="lede">{exhibition.summary}</p> : <p className="lede preview-empty-copy">No summary has been provided.</p>}
      </div>
      <CuratorExhibitionContext
        exhibition={exhibition}
        activeStep="preview"
        artworksDestination={artworksDestination}
      />
      <LazyExhibitionGallery
        exhibition={exhibition}
        fallback={<p className="virtual-gallery__fallback">The standard curator preview is shown below.</p>}
        exitAction={<Link className="text-link" to={`/exhibitions/${exhibition.id}/edit`}>Return to exhibition editor</Link>}
      />
      <section className="preview-publication" aria-labelledby="preview-publication-heading">
        <h2 id="preview-publication-heading">Publication details</h2>
        <p>{isPublished
          ? 'This is the curator view of a published exhibition.'
          : 'This draft is visible only in the curator workspace.'}
        </p>
        <dl>
          <div><dt>Status</dt><dd>{isPublished ? 'Published' : 'Draft'}</dd></div>
          {exhibition.publishedAt && <div><dt>Published</dt><dd><time dateTime={exhibition.publishedAt}>{formatTimestamp(exhibition.publishedAt)}</time></dd></div>}
          <div><dt>Created</dt><dd><time dateTime={exhibition.createdAt}>{formatTimestamp(exhibition.createdAt)}</time></dd></div>
          <div><dt>Last updated</dt><dd><time dateTime={exhibition.updatedAt}>{formatTimestamp(exhibition.updatedAt)}</time></dd></div>
        </dl>
        <PublicationControls
          key={reconciledUnpublishDraft ? 'reconciled-unpublish-draft' : 'publication-controls'}
          exhibition={exhibition}
          coverItem={coverItem}
          mutation={publicationMutation}
          error={reconciledUnpublishDraft ? null : publicationError}
          success={publicationSuccess}
          artworksDestination={artworksDestination}
          onTransition={transitionPublication}
          onClearFeedback={clearPublicationFeedback}
        />
      </section>
      <section className="preview-introduction" aria-labelledby="preview-introduction-heading">
        <h2 id="preview-introduction-heading">Introduction</h2>
        {exhibition.introduction
          ? <p>{exhibition.introduction}</p>
          : <p className="preview-empty-copy">No introduction has been provided.</p>}
      </section>
      <section className="preview-cover" aria-labelledby="preview-cover-heading">
        <h2 id="preview-cover-heading">Cover artwork</h2>
        {coverItem ? <CoverArtwork item={coverItem} /> : <p className="preview-empty-copy">No cover artwork has been selected.</p>}
      </section>
      <section className="preview-artworks" aria-labelledby="preview-artworks-heading">
        <h2 id="preview-artworks-heading">Artworks ({orderedItems.length})</h2>
        {orderedItems.length === 0 ? (
          <p className="preview-empty-copy">No artworks have been added to this exhibition.</p>
        ) : (
          <ol className="preview-artwork-list" aria-label="Exhibition artworks">
            {orderedItems.map((item) => <PreviewArtwork key={item.id} item={item} itemCount={orderedItems.length} />)}
          </ol>
        )}
      </section>
    </section>
  )
}

function PublicationControls({
  exhibition,
  coverItem,
  mutation,
  error,
  success,
  artworksDestination,
  onTransition,
  onClearFeedback,
}: {
  exhibition: ExhibitionDetail
  coverItem: ExhibitionItem | null
  mutation: 'publish' | 'unpublish' | null
  error: Error | null
  success: string | null
  artworksDestination: string
  onTransition: (action: 'publish' | 'unpublish') => Promise<boolean>
  onClearFeedback: () => void
}) {
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const unpublishTriggerRef = useRef<HTMLButtonElement | null>(null)
  const cancelUnpublishRef = useRef<HTMLButtonElement | null>(null)
  const confirmUnpublishRef = useRef<HTMLButtonElement | null>(null)
  const successRef = useRef<HTMLParagraphElement | null>(null)
  const isPublished = exhibition.status === 'PUBLISHED'
  const isPublishing = mutation === 'publish'
  const isUnpublishing = mutation === 'unpublish'
  const prerequisites = [
    {
      id: 'title',
      label: 'A nonblank title',
      met: exhibition.title.trim().length > 0,
      action: 'Edit metadata',
      to: `/exhibitions/${exhibition.id}/edit`,
    },
    {
      id: 'artwork',
      label: 'At least one artwork',
      met: exhibition.items.length > 0,
      action: 'Curate artworks',
      to: artworksDestination,
    },
    {
      id: 'cover',
      label: exhibition.items.length === 0
        ? 'Add an artwork before choosing a cover'
        : 'A cover selected from the current artworks',
      met: coverItem !== null,
      action: exhibition.items.length === 0 ? null : 'Choose a cover',
      to: artworksDestination,
    },
  ]
  const isReadyToPublish = prerequisites.every((prerequisite) => prerequisite.met)

  useEffect(() => {
    if (confirmingUnpublish) cancelUnpublishRef.current?.focus({ preventScroll: true })
  }, [confirmingUnpublish])

  function requestUnpublish() {
    if (mutation !== null) return
    onClearFeedback()
    setConfirmingUnpublish(true)
  }

  function cancelUnpublish() {
    if (mutation !== null) return
    onClearFeedback()
    setConfirmingUnpublish(false)
    window.setTimeout(() => {
      if (unpublishTriggerRef.current?.isConnected) {
        unpublishTriggerRef.current.focus({ preventScroll: true })
      } else {
        document.getElementById('main-content')?.focus({ preventScroll: true })
      }
    }, 0)
  }

  async function confirmUnpublish() {
    if (mutation !== null) return
    const succeeded = await onTransition('unpublish')
    if (succeeded) {
      setConfirmingUnpublish(false)
      window.setTimeout(() => successRef.current?.focus({ preventScroll: true }), 0)
    } else {
      window.setTimeout(() => confirmUnpublishRef.current?.focus({ preventScroll: true }), 0)
    }
  }

  function handleConfirmationKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && mutation === null) {
      event.preventDefault()
      cancelUnpublish()
    }
  }

  return (
    <div className="preview-publication__controls">
      <h3>Publication controls</h3>
      {isPublished ? (
        <p>Published exhibitions are read-only. Unpublish to restore metadata and artwork curation.</p>
      ) : (
        <>
          <p id="publication-readiness-explanation">
            {isReadyToPublish
              ? 'This exhibition is ready to publish. Curatium will verify the current server state when you publish.'
              : 'Publish is unavailable until every required item below is ready.'}
          </p>
          <ul id="publication-prerequisites" className="publication-prerequisites" aria-label="Publication requirements">
            {prerequisites.map((prerequisite) => (
              <li key={prerequisite.id}>
                <strong>{prerequisite.met ? 'Ready' : 'Required'}:</strong> {prerequisite.label}
                {!prerequisite.met && prerequisite.action && (
                  <> — <Link className="text-link" to={prerequisite.to}>{prerequisite.action}</Link></>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <PublicationError error={error} />}
      {success && <p ref={successRef} className="form-success" role="status" tabIndex={-1}>{success}</p>}
      {isPublished && (
        <Link
          className="button button-secondary preview-publication__public-link"
          to={`/visit/${exhibition.id}`}
          state={createCuratorVisitState(exhibition.id)}
        >
          View public exhibition
        </Link>
      )}
      {isPublished && confirmingUnpublish ? (
        <div
          className="unpublish-confirmation"
          role="alertdialog"
          aria-labelledby="unpublish-confirmation-heading"
          aria-describedby="unpublish-confirmation-description"
          onKeyDown={handleConfirmationKeyDown}
        >
          <h4 id="unpublish-confirmation-heading">Unpublish this exhibition?</h4>
          <p id="unpublish-confirmation-description">
            The public exhibition will become unavailable. All exhibition content will be preserved, and the exhibition will return to an editable draft.
          </p>
          <div className="unpublish-confirmation__actions">
            <button
              ref={cancelUnpublishRef}
              className="button button-secondary"
              type="button"
              disabled={isUnpublishing}
              onClick={cancelUnpublish}
            >
              Cancel
            </button>
            <button
              ref={confirmUnpublishRef}
              className="button button-danger"
              type="button"
              disabled={isUnpublishing}
              onClick={confirmUnpublish}
            >
              {isUnpublishing ? 'Unpublishing…' : error ? 'Try unpublishing again' : 'Confirm unpublish'}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={isPublished ? unpublishTriggerRef : undefined}
          className="button"
          type="button"
          disabled={mutation !== null || (!isPublished && !isReadyToPublish)}
          aria-describedby={isPublished ? undefined : 'publication-readiness-explanation publication-prerequisites'}
          onClick={() => {
            if (isPublished) requestUnpublish()
            else if (isReadyToPublish) void onTransition('publish')
          }}
        >
          {isPublishing ? 'Publishing…' : isPublished ? 'Unpublish exhibition' : 'Publish exhibition'}
        </button>
      )}
    </div>
  )
}

function PublicationError({ error }: { error: Error }) {
  let message = 'An unexpected problem occurred while changing publication status. Please try again.'
  if (isFrontendError(error)) {
    if (error.code === 'INVALID_PUBLICATION_STATE') {
      message = error.message
    } else if (error.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
      message = 'This exhibition is currently read-only. The preview was refreshed to show the server state.'
    } else if (error.code === 'VALIDATION_ERROR') {
      message = error.message
    } else {
      message = error.message
    }
  }
  return <p className="form-alert" role="alert">{message}</p>
}

function CoverArtwork({ item }: { item: ExhibitionItem }) {
  return (
    <article className="preview-cover__content">
      <ArtworkImage src={imageFor(item.artwork)} alt={`Cover artwork: ${item.artwork.title}`} className="preview-artwork-image" />
      <div>
        <p className="preview-cover__label">Current cover</p>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artistDisplay || 'Artist unknown'}</p>
      </div>
    </article>
  )
}

function PreviewArtwork({ item, itemCount }: { item: ExhibitionItem; itemCount: number }) {
  const { artwork } = item
  return (
    <li>
      <article className="preview-artwork">
        <ArtworkImage src={imageFor(artwork)} alt={`Artwork ${item.position} of ${itemCount}: ${artwork.title}`} className="preview-artwork-image" />
        <div className="preview-artwork__body">
          <p className="preview-artwork__position">Artwork {item.position} of {itemCount}</p>
          <h3>{artwork.title}</h3>
          <p>{artwork.artistDisplay || 'Artist unknown'}</p>
          {artwork.dateDisplay && <p>{artwork.dateDisplay}</p>}
          {artwork.mediumDisplay && <p>{artwork.mediumDisplay}</p>}
          {artwork.creditLine && <p>{artwork.creditLine}</p>}
          <p>{artwork.publicDomain ? 'Public domain' : 'Rights status unavailable'}</p>
          {artwork.sourceUrl && <a className="text-link" href={artwork.sourceUrl} target="_blank" rel="noreferrer">View artwork source</a>}
          <section className="preview-artwork__note" aria-label={`Curatorial note for artwork ${item.position} of ${itemCount}: ${artwork.title}`}>
            <h4>Curatorial note</h4>
            {item.curatorialNote
              ? <p>{item.curatorialNote}</p>
              : <p className="preview-empty-copy">No curatorial note.</p>}
          </section>
        </div>
      </article>
    </li>
  )
}

function imageFor(artwork: ExhibitionArtwork) {
  return artwork.imageUrl || artwork.thumbnailUrl
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
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

function PreviewNotFound({ onRetry, focusOnMount }: { onRetry: () => void; focusOnMount: boolean }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: true })
  }, [focusOnMount])

  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Not found</p>
      <h1 ref={headingRef} tabIndex={focusOnMount ? -1 : undefined}>Exhibition not found</h1>
      <p>This exhibition may have been deleted or the address may be incorrect.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
      <Link className="text-link" to="/exhibitions">Return to exhibitions</Link>
    </section>
  )
}

function PreviewLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred while loading this preview. Please try again.'
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Preview unavailable</p>
      <h1>We could not load this preview</h1>
      <p>{message}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
    </section>
  )
}
