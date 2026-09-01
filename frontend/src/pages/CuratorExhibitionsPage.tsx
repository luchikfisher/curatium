import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState'
import { CuratorExhibitionRow } from '../components/CuratorExhibitionRow'
import { listCuratorExhibitions } from '../features/exhibitions/api'
import { useExhibitions } from '../features/exhibitions/useExhibitions'

export function CuratorExhibitionsPage() {
  const { data, error, retry } = useExhibitions(listCuratorExhibitions)

  return (
    <>
      <section className="page-heading page-heading--with-action">
        <div>
          <p className="eyebrow">Curator workspace</p>
          <h1>My exhibitions</h1>
          <p className="lede">Shape narratives from locally saved artworks.</p>
        </div>
        <Link className="button" to="/exhibitions/new">
          Create exhibition
        </Link>
      </section>
      <section className="content-section" aria-label="Your exhibitions">
        {data === null && !error && <LoadingState label="Loading your exhibitions…" geometry="curator-list" />}
        {error && <ErrorState error={error} onRetry={retry} />}
        {data?.length === 0 && (
          <EmptyState title="Begin your first exhibition">
            Your drafts and published exhibitions will appear here.
          </EmptyState>
        )}
        {data && data.length > 0 && (
          <ol className="curator-exhibition-list">
            {data.map((exhibition, index) => (
              <li key={exhibition.id}>
                <CuratorExhibitionRow
                  exhibition={exhibition}
                  position={index + 1}
                  exhibitionCount={data.length}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
