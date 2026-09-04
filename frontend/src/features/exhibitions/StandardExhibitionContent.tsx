import { ArtworkImage } from '../../components/ArtworkImage'
import { ArtworkSourceLink } from '../../components/ArtworkSourceLink'

interface EditorialArtwork {
  id: number
  title: string
  artistDisplay?: string | null
  dateDisplay?: string | null
  mediumDisplay?: string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  sourceUrl?: string | null
  creditLine?: string | null
  publicDomain?: boolean
}

interface EditorialExhibitionItem {
  id: number
  position: number
  curatorialNote?: string | null
  artwork: EditorialArtwork
}

interface EditorialExhibition {
  id: number
  title: string
  summary?: string | null
  introduction?: string | null
  publishedAt?: string | null
  items: EditorialExhibitionItem[]
}

export function StandardExhibitionContent({
  exhibition,
  variant,
  headingLevel = 1,
}: {
  exhibition: EditorialExhibition
  variant: 'public' | 'preview'
  headingLevel?: 1 | 2
}) {
  const orderedItems = [...exhibition.items].sort((first, second) => first.position - second.position)
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const SectionHeading = headingLevel === 1 ? 'h2' : 'h3'
  const ArtworkHeading = headingLevel === 1 ? 'h3' : 'h4'
  const headingId = `${variant}-standard-exhibition-heading`
  const artworksHeadingId = `${variant}-standard-exhibition-artworks-heading`

  return (
    <article className={`standard-exhibition standard-exhibition--${variant}`} aria-labelledby={headingId}>
      <div className="standard-exhibition__prologue">
        <header className="standard-exhibition__heading">
          <p className="eyebrow">{variant === 'public' ? 'Published exhibition' : 'Curator review'}</p>
          <Heading id={headingId}>{variant === 'public' ? exhibition.title : 'Standard exhibition'}</Heading>
          {variant === 'public' && exhibition.summary && <p className="lede">{exhibition.summary}</p>}
          {variant === 'public' && exhibition.publishedAt && (
            <p className="standard-exhibition__publication">
              Published <time dateTime={exhibition.publishedAt}>{formatTimestamp(exhibition.publishedAt)}</time>
            </p>
          )}
        </header>

        {exhibition.introduction && (
          <section className="standard-exhibition__introduction" aria-label="Exhibition introduction">
            <p>{exhibition.introduction}</p>
          </section>
        )}
      </div>

      <section
        className="standard-exhibition__sequence"
        aria-labelledby={artworksHeadingId}
        data-artwork-count={orderedItems.length}
      >
        <div className="standard-exhibition__sequence-heading">
          <SectionHeading id={artworksHeadingId}>Artworks</SectionHeading>
          <p>{orderedItems.length} {orderedItems.length === 1 ? 'work' : 'works'}</p>
        </div>
        {orderedItems.length === 0 ? (
          <p className="standard-exhibition__empty">No artworks are currently included in this exhibition.</p>
        ) : (
          <ol className="standard-exhibition__artwork-list" aria-label="Exhibition artworks">
            {orderedItems.map((item) => (
              <EditorialArtworkRecord
                key={item.id}
                item={item}
                itemCount={orderedItems.length}
                Heading={ArtworkHeading}
              />
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}

function EditorialArtworkRecord({
  item,
  itemCount,
  Heading,
}: {
  item: EditorialExhibitionItem
  itemCount: number
  Heading: 'h3' | 'h4'
}) {
  const { artwork } = item
  const descriptor = `artwork ${item.position} of ${itemCount}: ${artwork.title}`
  const hasObjectDetails = Boolean(artwork.mediumDisplay || artwork.creditLine || artwork.publicDomain)

  return (
    <li className="standard-exhibition__artwork-item">
      <article className="standard-exhibition__artwork">
        <div className="standard-exhibition__media">
          <ArtworkImage
            src={artwork.imageUrl || artwork.thumbnailUrl || null}
            visualRole="artwork"
            alt={`Artwork ${item.position} of ${itemCount}: ${artwork.title}`}
            className="standard-exhibition__image"
          />
        </div>
        <div className="standard-exhibition__artwork-copy">
          <p className="standard-exhibition__position">Artwork {item.position} of {itemCount}</p>
          <Heading>{artwork.title}</Heading>
          <p className="standard-exhibition__byline">
            <span>{artwork.artistDisplay || 'Artist unknown'}</span>
            {artwork.dateDisplay && <span>{artwork.dateDisplay}</span>}
          </p>
          {item.curatorialNote && (
            <section className="standard-exhibition__note" aria-label={`Curatorial note for ${descriptor}`}>
              <p className="standard-exhibition__note-label">Curatorial note</p>
              <p>{item.curatorialNote}</p>
            </section>
          )}
          {hasObjectDetails && (
            <details className="standard-exhibition__details">
              <summary aria-label={`Object details for ${descriptor}`}>Object details</summary>
              <dl>
                {artwork.mediumDisplay && <Metadata label="Medium" value={artwork.mediumDisplay} />}
                {artwork.creditLine && <Metadata label="Credit line" value={artwork.creditLine} />}
                {artwork.publicDomain && <Metadata label="Rights" value="Public domain" />}
              </dl>
            </details>
          )}
          {artwork.sourceUrl && <ArtworkSourceLink href={artwork.sourceUrl} descriptor={descriptor} />}
        </div>
      </article>
    </li>
  )
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}
