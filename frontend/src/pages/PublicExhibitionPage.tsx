import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isFrontendError, FrontendError } from '../api/errors'
import { LoadingState } from '../components/AsyncState'
import { getPublicExhibition } from '../features/exhibitions/api'
import { StandardExhibitionContent } from '../features/exhibitions/StandardExhibitionContent'
import { useExhibition } from '../features/exhibitions/useExhibition'
import { curatorReturnTarget } from '../features/exhibitions/curatorVisitState'
import { LazyExhibitionGallery } from '../features/virtual-gallery/LazyExhibitionGallery'
import type { PublicExhibitionDetail } from '../features/exhibitions/types'
import { useRouteDocumentTitle } from '../features/route-orientation/useRouteDocumentTitle'
import { useRouteFocusTarget } from '../features/route-orientation/useRouteFocusTarget'

export function PublicExhibitionPage() {
  const { id } = useParams()
  const exhibitionId = parseExhibitionId(id)
  if (exhibitionId === null) return <InvalidExhibitionRoute />
  return <PublicExhibition key={id} exhibitionId={exhibitionId} />
}

function PublicExhibition({ exhibitionId }: { exhibitionId: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: exhibition, error, retry } = useExhibition(exhibitionId, getPublicExhibition)
  const [curatorReturnTo] = useState(() => curatorReturnTarget(location.state, exhibitionId))
  const loadedExhibition = exhibition?.id === exhibitionId ? exhibition : null
  useRouteDocumentTitle({
    routeId: 'public-exhibition',
    exhibitionId,
    title: loadedExhibition
      ? `${loadedExhibition.title} | Curatium`
      : error
        ? isFrontendError(error) && error.status === 404
          ? 'Exhibition not found | Curatium'
          : 'Exhibition unavailable | Curatium'
        : exhibition === null
          ? null
          : 'Exhibition unavailable | Curatium',
    announcement: loadedExhibition ? `Exhibition: ${loadedExhibition.title}` : null,
  })

  useEffect(() => {
    if (curatorReturnTo === null) return
    navigate(location.pathname, { replace: true, state: null })
  }, [curatorReturnTo, location.pathname, navigate])

  if (exhibition?.id !== exhibitionId) {
    if (!error && exhibition === null) return <LoadingState label="Loading exhibition…" geometry="public-exhibition" />
    if (isFrontendError(error) && error.status === 404) return <PublicExhibitionNotFound onRetry={retry} />
    return <PublicExhibitionLoadError
      error={error ?? new FrontendError('The server returned an exhibition for a different address.', 'malformed', 200)}
      onRetry={retry}
    />
  }

  return (
    <LazyExhibitionGallery
      exhibition={exhibition}
      headingLevel={1}
      fallback={<StandardExhibition exhibition={exhibition} curatorReturnTo={curatorReturnTo} />}
      rendererLoadingFallback={<StandardExhibition exhibition={exhibition} curatorReturnTo={curatorReturnTo} headingLevel={2} />}
      exitAction={(
        <>
          {curatorReturnTo && (
            <Link className="text-link" to={curatorReturnTo}>Return to curator preview</Link>
          )}
          <Link className="text-link" to="/">Exit to exhibitions</Link>
        </>
      )}
    />
  )
}

function StandardExhibition({
  exhibition,
  curatorReturnTo,
  headingLevel = 1,
}: {
  exhibition: PublicExhibitionDetail
  curatorReturnTo: string | null
  headingLevel?: 1 | 2
}) {
  return (
    <>
      <StandardExhibitionContent exhibition={exhibition} variant="public" headingLevel={headingLevel} />
      <nav className="public-exhibition__navigation" aria-label="Exhibition navigation">
        {curatorReturnTo && (
          <Link className="text-link" to={curatorReturnTo}>Return to curator preview</Link>
        )}
        <Link className="text-link" to="/">Exit to exhibitions</Link>
      </nav>
    </>
  )
}

function InvalidExhibitionRoute() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef)
  useRouteDocumentTitle({
    routeId: 'public-exhibition',
    exhibitionId: null,
    title: 'Invalid exhibition address | Curatium',
  })
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Invalid address</p>
      <h1 ref={headingRef}>Invalid exhibition address</h1>
      <p>Use an exhibition address from the public catalogue.</p>
      <Link className="text-link" to="/">Return to exhibitions</Link>
    </section>
  )
}

function PublicExhibitionNotFound({ onRetry }: { onRetry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef)
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Not found</p>
      <h1 ref={headingRef}>Exhibition not found</h1>
      <p>This exhibition is not available, or the address may be incorrect.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
      <Link className="text-link" to="/">Return to exhibitions</Link>
    </section>
  )
}

function PublicExhibitionLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef)
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred while loading this exhibition. Please try again.'
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Exhibition unavailable</p>
      <h1 ref={headingRef}>We could not load this exhibition</h1>
      <p>{message}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
    </section>
  )
}

function parseExhibitionId(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null
  const exhibitionId = Number(id)
  return Number.isSafeInteger(exhibitionId) && exhibitionId > 0 ? exhibitionId : null
}
