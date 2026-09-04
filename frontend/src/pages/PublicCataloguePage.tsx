import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState'
import { PublicExhibitionCard } from '../components/PublicExhibitionCard'
import { listPublicExhibitions } from '../features/exhibitions/api'
import { useExhibitions } from '../features/exhibitions/useExhibitions'

export function PublicCataloguePage() {
  const { data, error, retry } = useExhibitions(listPublicExhibitions)

  return (
    <section className="public-catalogue" aria-labelledby="public-catalogue-heading">
      <header className="public-catalogue__introduction">
        <div className="public-catalogue__identity">
          <p className="eyebrow">Public exhibitions</p>
          <h1 id="public-catalogue-heading">Art, brought into conversation.</h1>
        </div>
        <p className="lede">
          Explore small, thoughtful exhibitions assembled from museum collections.
        </p>
      </header>
      <section className="public-catalogue__collection" aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading" className="visually-hidden">Now showing</h2>
        {data === null && !error && <LoadingState label="Loading exhibitions…" geometry="exhibition-grid" />}
        {error && <ErrorState error={error} onRetry={retry} />}
        {data?.length === 0 && (
          <EmptyState title="The gallery is quiet">
            No exhibitions have been published yet. Please visit again soon.
          </EmptyState>
        )}
        {data && data.length > 0 && (
          <div className="exhibition-grid">
            {data.map((exhibition, index) => (
              <PublicExhibitionCard
                key={exhibition.id}
                exhibition={exhibition}
                position={index + 1}
                exhibitionCount={data.length}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
