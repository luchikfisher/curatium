import { Link } from 'react-router-dom'
import { ArtworkImage } from './ArtworkImage'
import type { ExhibitionSummary } from '../features/exhibitions/types'

export function PublicExhibitionCard({
  exhibition,
  position,
  exhibitionCount,
}: {
  exhibition: ExhibitionSummary
  position: number
  exhibitionCount: number
}) {
  const destination = `/visit/${exhibition.id}`
  const count = `${exhibition.artworkCount} ${exhibition.artworkCount === 1 ? 'artwork' : 'artworks'}`
  const actionName = `Visit exhibition ${position} of ${exhibitionCount}: ${exhibition.title}`

  return (
    <article className="public-exhibition-card">
      <Link className="public-exhibition-card__entry" to={destination} aria-label={actionName}>
        <ArtworkImage
          src={exhibition.coverImageUrl}
          visualRole="cover"
          decorative
          loading="lazy"
          className="public-exhibition-card__image"
        />
        <div className="public-exhibition-card__caption">
          <h2>{exhibition.title}</h2>
          {exhibition.summary && <p className="public-exhibition-card__summary">{exhibition.summary}</p>}
          <p className="card-meta">{count}</p>
        </div>
      </Link>
    </article>
  )
}
