import { isFrontendError } from '../api/errors'

export type LoadingGeometry =
  | 'exhibition-grid'
  | 'curator-list'
  | 'metadata'
  | 'artworks'
  | 'preview'
  | 'public-exhibition'

export function LoadingState({
  label,
  geometry,
}: {
  label: string
  geometry?: LoadingGeometry
}) {
  return (
    <div className={geometry ? 'loading-layout' : undefined}>
      <div className="state-panel" role="status" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <p>{label}</p>
      </div>
      {geometry && <ReservedLoadingGeometry geometry={geometry} />}
    </div>
  )
}

function ReservedLoadingGeometry({ geometry }: { geometry: LoadingGeometry }) {
  if (geometry === 'exhibition-grid') {
    return (
      <div className="exhibition-grid loading-geometry loading-geometry--exhibition-grid" aria-hidden="true">
        <LoadingCard />
        <LoadingCard />
      </div>
    )
  }

  if (geometry === 'curator-list') {
    return (
      <div className="curator-exhibition-list loading-geometry loading-geometry--curator-list" aria-hidden="true">
        <LoadingCuratorRow />
        <LoadingCuratorRow />
      </div>
    )
  }

  return (
    <div className={`loading-geometry loading-route-shell loading-route-shell--${geometry}`} aria-hidden="true">
      <div className="loading-route-shell__heading">
        <span className="loading-shape loading-shape--eyebrow" />
        <span className="loading-shape loading-shape--title" />
        <span className="loading-shape loading-shape--lede" />
      </div>
      {geometry !== 'public-exhibition' && (
        <div className="loading-route-shell__context">
          <span className="loading-shape loading-shape--context-title" />
          <span className="loading-shape loading-shape--context-links" />
        </div>
      )}
      <ReservedRouteContent geometry={geometry} />
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="loading-card">
      <span className="loading-shape loading-card__media" />
      <div className="loading-card__body">
        <span className="loading-shape loading-shape--card-title" />
        <span className="loading-shape loading-shape--line" />
        <span className="loading-shape loading-shape--line loading-shape--line-short" />
      </div>
    </div>
  )
}

function LoadingCuratorRow() {
  return (
    <div className="loading-curator-row">
      <span className="loading-shape loading-curator-row__media" />
      <div className="loading-curator-row__body">
        <span className="loading-shape loading-shape--eyebrow" />
        <span className="loading-shape loading-shape--card-title" />
        <span className="loading-shape loading-shape--line loading-shape--line-short" />
      </div>
      <span className="loading-shape loading-curator-row__action" />
    </div>
  )
}

function ReservedRouteContent({ geometry }: { geometry: Exclude<LoadingGeometry, 'exhibition-grid' | 'curator-list'> }) {
  if (geometry === 'metadata') {
    return (
      <div className="loading-route-shell__section loading-route-shell__section--form">
        <span className="loading-shape loading-shape--section-title" />
        <span className="loading-shape loading-shape--field" />
        <span className="loading-shape loading-shape--field loading-shape--field-large" />
      </div>
    )
  }

  if (geometry === 'artworks') {
    return (
      <>
        <div className="loading-route-shell__section">
          <span className="loading-shape loading-shape--section-title" />
          <span className="loading-shape loading-shape--line" />
        </div>
        <div className="loading-route-shell__section loading-route-shell__artwork-row">
          <span className="loading-shape loading-route-shell__thumbnail" />
          <div>
            <span className="loading-shape loading-shape--card-title" />
            <span className="loading-shape loading-shape--line loading-shape--line-short" />
          </div>
        </div>
      </>
    )
  }

  if (geometry === 'preview') {
    return (
      <>
        <span className="loading-shape loading-route-shell__gallery" />
        <div className="loading-route-shell__section">
          <span className="loading-shape loading-shape--section-title" />
          <span className="loading-shape loading-shape--line" />
          <span className="loading-shape loading-shape--line loading-shape--line-short" />
        </div>
      </>
    )
  }

  return (
    <>
      <span className="loading-shape loading-route-shell__gallery" />
      <div className="loading-route-shell__section">
        <span className="loading-shape loading-shape--section-title" />
        <span className="loading-shape loading-shape--line" />
        <span className="loading-shape loading-shape--line loading-shape--line-short" />
      </div>
    </>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="state-panel">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const recoverable = isFrontendError(error)
  return (
    <section className="state-panel" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h2>{recoverable ? 'We could not load this collection' : 'An unexpected problem occurred'}</h2>
      <p>
        {recoverable
          ? error.message
          : 'Please try again. If the problem continues, refresh the page.'}
      </p>
      <button className="button button-secondary" type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  )
}
