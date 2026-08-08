import { Link } from 'react-router-dom'
import { ArtworkImage } from './ArtworkImage'
import type { ExhibitionSummary } from '../features/exhibitions/types'

export function ExhibitionCard({
  exhibition,
  curator = false,
}: {
  exhibition: ExhibitionSummary
  curator?: boolean
}) {
  const destination = curator
    ? `/exhibitions/${exhibition.id}/edit`
    : `/visit/${exhibition.id}`
  const count = `${exhibition.artworkCount} ${
    exhibition.artworkCount === 1 ? 'artwork' : 'artworks'
  }`

  return (
    <article className="exhibition-card">
      <ArtworkImage
        src={exhibition.coverImageUrl}
        decorative
        loading="lazy"
        className="exhibition-card__image"
      />
      <div className="exhibition-card__body">
        {curator && (
          <span className={`status status--${exhibition.status.toLowerCase()}`}>
            {exhibition.status === 'DRAFT' ? 'Draft' : 'Published'}
          </span>
        )}
        <h2>{exhibition.title}</h2>
        <p>{exhibition.summary || 'No summary has been added yet.'}</p>
        <div className="card-meta">
          <span>{count}</span>
          {curator && (
            <time dateTime={exhibition.updatedAt}>
              Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(exhibition.updatedAt))}
            </time>
          )}
        </div>
        <Link className="text-link" to={destination}>
          {curator
            ? exhibition.status === 'PUBLISHED' ? 'Manage exhibition' : 'Edit exhibition'
            : 'Enter exhibition'}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </article>
  )
}
