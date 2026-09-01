import { Link } from 'react-router-dom'
import { ArtworkImage } from './ArtworkImage'
import type { ExhibitionSummary } from '../features/exhibitions/types'

export function ExhibitionCard({
  exhibition,
  position,
  exhibitionCount,
}: {
  exhibition: ExhibitionSummary
  position: number
  exhibitionCount: number
}) {
  const destination = `/visit/${exhibition.id}`
  const count = `${exhibition.artworkCount} ${
    exhibition.artworkCount === 1 ? 'artwork' : 'artworks'
  }`
  const visibleAction = 'Enter exhibition'
  const actionName = `${visibleAction} ${position} of ${exhibitionCount}: ${exhibition.title}`

  return (
    <article className="exhibition-card">
      <ArtworkImage
        src={exhibition.coverImageUrl}
        visualRole="cover"
        decorative
        loading="lazy"
        className="exhibition-card__image"
      />
      <div className="exhibition-card__body">
        <h2>{exhibition.title}</h2>
        <p>{exhibition.summary || 'No summary has been added yet.'}</p>
        <div className="card-meta">
          <span>{count}</span>
        </div>
        <Link className="text-link" to={destination} aria-label={actionName}>
          {visibleAction}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </article>
  )
}
