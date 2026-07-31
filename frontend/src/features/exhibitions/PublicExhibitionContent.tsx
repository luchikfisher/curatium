import type { PublicExhibitionDetail, PublicExhibitionItem } from './types'

export function PublicExhibitionContent({ exhibition }: { exhibition: PublicExhibitionDetail }) {
  const orderedItems = [...exhibition.items].sort((first, second) => first.position - second.position)
  const coverItem = exhibition.coverArtworkId === null
    ? null
    : orderedItems.find((item) => item.artwork.id === exhibition.coverArtworkId) ?? null

  return (
    <article className="public-exhibition">
      <header className="public-exhibition__heading">
        <p className="eyebrow">Published exhibition</p>
        <h1>{exhibition.title}</h1>
        {exhibition.summary ? (
          <p className="lede">{exhibition.summary}</p>
        ) : (
          <p className="lede public-exhibition__empty-copy">No summary has been provided.</p>
        )}
        {exhibition.publishedAt ? (
          <p className="public-exhibition__publication">
            Published <time dateTime={exhibition.publishedAt}>{formatTimestamp(exhibition.publishedAt)}</time>
          </p>
        ) : (
          <p className="public-exhibition__publication public-exhibition__empty-copy">Publication date unavailable.</p>
        )}
      </header>

      <section className="public-exhibition__section" aria-labelledby="public-introduction-heading">
        <h2 id="public-introduction-heading">Introduction</h2>
        {exhibition.introduction ? (
          <p>{exhibition.introduction}</p>
        ) : (
          <p className="public-exhibition__empty-copy">No introduction has been provided.</p>
        )}
      </section>

      <section className="public-exhibition__section" aria-labelledby="public-cover-heading">
        <h2 id="public-cover-heading">Cover artwork</h2>
        {coverItem ? (
          <CoverArtwork item={coverItem} />
        ) : (
          <p className="public-exhibition__empty-copy">No cover artwork has been selected.</p>
        )}
      </section>

      <section className="public-exhibition__section" aria-labelledby="public-artworks-heading">
        <h2 id="public-artworks-heading">Artworks ({orderedItems.length})</h2>
        {orderedItems.length === 0 ? (
          <p className="public-exhibition__empty-copy">No artworks are currently included in this exhibition.</p>
        ) : (
          <ol className="public-exhibition__artwork-list" aria-label="Exhibition artworks">
            {orderedItems.map((item) => (
              <PublicArtwork key={item.id} item={item} itemCount={orderedItems.length} />
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}

function CoverArtwork({ item }: { item: PublicExhibitionItem }) {
  return (
    <article className="public-exhibition__cover">
      <img src={item.artwork.imageUrl} alt={`Cover artwork: ${item.artwork.title}`} />
      <div>
        <p className="public-exhibition__cover-label">Current cover</p>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artistDisplay || 'Artist unknown'}</p>
      </div>
    </article>
  )
}

function PublicArtwork({ item, itemCount }: { item: PublicExhibitionItem; itemCount: number }) {
  const { artwork } = item
  const descriptor = `artwork ${item.position} of ${itemCount}: ${artwork.title}`

  return (
    <li>
      <article className="public-exhibition__artwork">
        <img src={artwork.imageUrl} alt={`Artwork ${item.position} of ${itemCount}: ${artwork.title}`} />
        <div className="public-exhibition__artwork-body">
          <p className="public-exhibition__position">Artwork {item.position} of {itemCount}</p>
          <h3>{artwork.title}</h3>
          <dl className="public-exhibition__metadata">
            <Metadata label="Artist" value={artwork.artistDisplay || 'Artist unknown'} />
            <Metadata label="Date" value={artwork.dateDisplay || 'Date unavailable'} />
            <Metadata label="Medium" value={artwork.mediumDisplay || 'Medium unavailable'} />
            <Metadata label="Credit line" value={artwork.creditLine || 'Credit line unavailable'} />
          </dl>
          <section className="public-exhibition__note" aria-label={`Curatorial note for ${descriptor}`}>
            <h4>Curatorial note</h4>
            {item.curatorialNote ? (
              <p>{item.curatorialNote}</p>
            ) : (
              <p className="public-exhibition__empty-copy">No curatorial note.</p>
            )}
          </section>
          {artwork.sourceUrl ? (
            <a
              className="text-link"
              href={artwork.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`View source for ${descriptor}`}
            >
              View artwork source
            </a>
          ) : (
            <p className="public-exhibition__source-unavailable">Artwork source unavailable.</p>
          )}
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
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
