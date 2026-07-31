import type { KeyboardEvent } from 'react'
import type { SlottedArtwork } from './types'

export function GalleryNavigation({
  assignments,
  selectedIndex,
  onSelect,
}: {
  assignments: readonly SlottedArtwork[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const current = assignments[selectedIndex] ?? null
  const hasPrevious = selectedIndex > 0
  const hasNext = selectedIndex >= 0 && selectedIndex < assignments.length - 1

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' && hasPrevious) {
      event.preventDefault()
      onSelect(selectedIndex - 1)
    }
    if (event.key === 'ArrowRight' && hasNext) {
      event.preventDefault()
      onSelect(selectedIndex + 1)
    }
  }

  return (
    <nav className="gallery-navigation" aria-label="Artwork navigation" tabIndex={0} onKeyDown={handleKeyDown}>
      {current ? (
        <p className="gallery-navigation__current" role="status" aria-live="polite">
          Artwork {selectedIndex + 1} of {assignments.length}: {current.item.artwork.title}
        </p>
      ) : (
        <p className="gallery-navigation__current" role="status">No artworks are available in this gallery.</p>
      )}
      <div className="gallery-navigation__controls">
        <button className="button button-secondary" type="button" disabled={!hasPrevious} onClick={() => onSelect(selectedIndex - 1)}>
          Previous artwork
        </button>
        <button className="button" type="button" disabled={!hasNext} onClick={() => onSelect(selectedIndex + 1)}>
          Next artwork
        </button>
      </div>
      <p className="gallery-navigation__hint">With this navigation focused, use Left and Right Arrow keys to move through artworks.</p>
    </nav>
  )
}
