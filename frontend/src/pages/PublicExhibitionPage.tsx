import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isFrontendError, FrontendError } from '../api/errors'
import { LoadingState } from '../components/AsyncState'
import { getPublicExhibition } from '../features/exhibitions/api'
import { PublicExhibitionContent } from '../features/exhibitions/PublicExhibitionContent'
import { useExhibition } from '../features/exhibitions/useExhibition'
import { curatorReturnTarget } from '../features/exhibitions/curatorVisitState'
import { LazyExhibitionGallery } from '../features/virtual-gallery/LazyExhibitionGallery'
import type { PublicExhibitionDetail } from '../features/exhibitions/types'

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

  useEffect(() => {
    if (curatorReturnTo === null) return
    navigate(location.pathname, { replace: true, state: null })
  }, [curatorReturnTo, location.pathname, navigate])

  if (exhibition?.id !== exhibitionId) {
    if (!error && exhibition === null) return <LoadingState label="Loading exhibition…" />
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
}: {
  exhibition: PublicExhibitionDetail
  curatorReturnTo: string | null
}) {
  return (
    <>
      <PublicExhibitionContent exhibition={exhibition} />
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
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Invalid address</p>
      <h1>Invalid exhibition address</h1>
      <p>Use an exhibition address from the public catalogue.</p>
      <Link className="text-link" to="/">Return to exhibitions</Link>
    </section>
  )
}

function PublicExhibitionNotFound({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Not found</p>
      <h1>Exhibition not found</h1>
      <p>This exhibition is not available, or the address may be incorrect.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
      <Link className="text-link" to="/">Return to exhibitions</Link>
    </section>
  )
}

function PublicExhibitionLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred while loading this exhibition. Please try again.'
  return (
    <section className="state-panel public-exhibition__state" role="alert">
      <p className="eyebrow">Exhibition unavailable</p>
      <h1>We could not load this exhibition</h1>
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
