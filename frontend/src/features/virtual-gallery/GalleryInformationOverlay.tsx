import { type KeyboardEvent, useEffect, useRef } from 'react'
import { ArtworkSourceLink } from '../../components/ArtworkSourceLink'
import type { SlottedArtwork } from './types'

export function GalleryInformationOverlay({
  assignment,
  itemIndex,
  itemCount,
  dialogId,
  onClose,
}: {
  assignment: SlottedArtwork
  itemIndex: number
  itemCount: number
  dialogId: string
  onClose: () => void
}) {
  const overlayRef = useRef<HTMLElement>(null)
  const { artwork } = assignment.item
  const descriptor = `artwork ${itemIndex + 1} of ${itemCount}: ${artwork.title}`

  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  return (
    <section
      id={dialogId}
      ref={overlayRef}
      className="gallery-information"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${dialogId}-heading`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="gallery-information__header">
        <div>
          <p className="gallery-information__position">Artwork {itemIndex + 1} of {itemCount}</p>
          <h2 id={`${dialogId}-heading`}>{artwork.title}</h2>
        </div>
        <button className="text-link" type="button" aria-label={`Close information for ${descriptor}`} onClick={onClose}>Close</button>
      </header>
      <dl className="gallery-information__metadata">
        <Metadata label="Artist" value={artwork.artistDisplay || 'Artist unknown'} />
        <Metadata label="Date" value={artwork.dateDisplay || 'Date unavailable'} />
        <Metadata label="Medium" value={artwork.mediumDisplay || 'Medium unavailable'} />
        <Metadata label="Credit line" value={artwork.creditLine || 'Credit line unavailable'} />
      </dl>
      <section className="gallery-information__note" aria-label={`Curatorial note for ${descriptor}`}>
        <h3>Curatorial note</h3>
        {assignment.item.curatorialNote
          ? <p>{assignment.item.curatorialNote}</p>
          : <p className="gallery-information__empty-copy">No curatorial note.</p>}
      </section>
      {artwork.sourceUrl
        ? <ArtworkSourceLink href={artwork.sourceUrl} descriptor={descriptor} />
        : <p className="gallery-information__empty-copy">Artwork source unavailable.</p>}
    </section>
  )
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}
