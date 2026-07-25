import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState'
import { ExhibitionCard } from '../components/ExhibitionCard'
import { listPublicExhibitions } from '../features/exhibitions/api'
import { useExhibitions } from '../features/exhibitions/useExhibitions'

export function PublicCataloguePage() {
  const { data, error, retry } = useExhibitions(listPublicExhibitions)

  return (
    <>
      <section className="page-heading page-heading--hero">
        <p className="eyebrow">Public exhibitions</p>
        <h1>Art, brought into conversation.</h1>
        <p className="lede">
          Explore small, thoughtful exhibitions assembled from museum collections.
        </p>
      </section>
      <section className="content-section" aria-labelledby="catalogue-heading">
        <div className="section-heading">
          <h2 id="catalogue-heading">Now showing</h2>
        </div>
        {data === null && !error && <LoadingState label="Loading exhibitions…" />}
        {error && <ErrorState error={error} onRetry={retry} />}
        {data?.length === 0 && (
          <EmptyState title="The gallery is quiet">
            No exhibitions have been published yet. Please visit again soon.
          </EmptyState>
        )}
        {data && data.length > 0 && (
          <div className="exhibition-grid">
            {data.map((exhibition) => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
