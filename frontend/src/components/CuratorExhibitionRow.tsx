import { Link } from 'react-router-dom'
import type { ExhibitionSummary } from '../features/exhibitions/types'
import { ArtworkImage } from './ArtworkImage'

export function CuratorExhibitionRow({
  exhibition,
  position,
  exhibitionCount,
}: {
  exhibition: ExhibitionSummary
  position: number
  exhibitionCount: number
}) {
  const visibleAction = exhibition.status === 'PUBLISHED'
    ? 'Manage exhibition'
    : 'Edit exhibition'
  const actionName = `${visibleAction} ${position} of ${exhibitionCount}: ${exhibition.title}`
  const artworkCount = `${exhibition.artworkCount} ${exhibition.artworkCount === 1 ? 'artwork' : 'artworks'}`

  return (
    <article className="curator-exhibition-row">
      <ArtworkImage
        src={exhibition.coverImageUrl}
        visualRole="thumbnail"
        decorative
        loading="lazy"
        className="curator-exhibition-row__image"
      />
      <div className="curator-exhibition-row__body">
        <span className={`status status--${exhibition.status.toLowerCase()}`}>
          {exhibition.status === 'PUBLISHED' ? 'Published' : 'Draft'}
        </span>
        <h2>{exhibition.title}</h2>
        <p className="curator-exhibition-row__meta">
          <span>{artworkCount}</span>
          <time dateTime={exhibition.updatedAt}>
            Updated {formatDate(exhibition.updatedAt)}
          </time>
        </p>
      </div>
      <Link
        className="button button-secondary curator-exhibition-row__action"
        to={`/exhibitions/${exhibition.id}/edit`}
        aria-label={actionName}
      >
        {visibleAction}
      </Link>
    </article>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}
