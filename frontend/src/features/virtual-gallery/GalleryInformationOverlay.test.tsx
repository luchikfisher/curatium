import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GalleryInformationOverlay } from './GalleryInformationOverlay'
import { GalleryNavigation } from './GalleryNavigation'
import { gallerySessionKey } from './session'
import { assignArtworkSlots } from './slots'
import type { GalleryExhibition, GalleryItem } from './types'

function item(position: number, title = `Artwork ${position}`, overrides: Partial<GalleryItem['artwork']> = {}, curatorialNote: string | null = `Note for artwork ${position}.`): GalleryItem {
  return {
    id: position + 10,
    position,
    curatorialNote,
    artwork: {
      id: position + 100,
      title,
      imageUrl: `https://images.example/${position}.jpg`,
      artistDisplay: `Artist ${position}`,
      dateDisplay: `19${position}0`,
      mediumDisplay: `Medium ${position}`,
      creditLine: `Credit ${position}`,
      sourceUrl: `https://museum.example/${position}`,
      ...overrides,
    },
  }
}

function InformationSession({ items }: { items: GalleryItem[] }) {
  const assignments = assignArtworkSlots(items)
  const [selectedIndex, setSelectedIndex] = useState(assignments.length > 0 ? 0 : -1)
  const [informationOpen, setInformationOpen] = useState(false)
  const informationButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const current = assignments[selectedIndex] ?? null
  useEffect(() => {
    if (!informationOpen && restoreFocus.current) {
      informationButtonRef.current?.focus()
      restoreFocus.current = false
    }
  }, [informationOpen])

  const closeInformation = () => {
    restoreFocus.current = true
    setInformationOpen(false)
  }

  return (
    <>
      {informationOpen && current && (
        <GalleryInformationOverlay assignment={current} itemIndex={selectedIndex} itemCount={assignments.length} onClose={closeInformation} />
      )}
      <GalleryNavigation
        assignments={assignments}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onOpenInformation={() => setInformationOpen(true)}
        informationOpen={informationOpen}
        informationButtonRef={informationButtonRef}
      />
    </>
  )
}

function InformationForExhibition({ exhibition }: { exhibition: GalleryExhibition }) {
  return <InformationSession key={gallerySessionKey(exhibition)} items={exhibition.items} />
}

afterEach(cleanup)

describe('gallery information overlay', () => {
  it('shows the selected artwork metadata, note, credit, source, and committed position', () => {
    render(<InformationSession items={[item(2, 'Second'), item(1, 'First')]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 1 of 2: First' }))

    const overlay = screen.getByRole('dialog', { name: 'First' })
    expect(overlay).toHaveTextContent('Artwork 1 of 2')
    expect(overlay).toHaveTextContent('Artist 1')
    expect(overlay).toHaveTextContent('1910')
    expect(overlay).toHaveTextContent('Medium 1')
    expect(overlay).toHaveTextContent('Credit 1')
    expect(overlay).toHaveTextContent('Note for artwork 1.')
    expect(screen.getByRole('link', { name: 'View source for artwork 1 of 2: First' })).toHaveAttribute('href', 'https://museum.example/1')
    expect(overlay).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Close information for artwork 1 of 2: First' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open information for artwork 1 of 2: First' })).toHaveFocus()
  })

  it('updates open information through previous, next, and keyboard navigation', () => {
    render(<InformationSession items={[item(1, 'First'), item(2, 'Second'), item(3, 'Third')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 1 of 3: First' }))

    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('dialog', { name: 'Second' })).toHaveTextContent('Artwork 2 of 3')

    fireEvent.keyDown(screen.getByRole('navigation', { name: 'Artwork navigation' }), { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'Third' })).toHaveTextContent('Artwork 3 of 3')

    fireEvent.click(screen.getByRole('button', { name: 'Previous artwork' }))
    expect(screen.getByRole('dialog', { name: 'Second' })).toHaveTextContent('Artwork 2 of 3')
  })

  it('shows sensible empty metadata and note states', () => {
    render(<InformationSession items={[item(1, 'Untitled', {
      artistDisplay: null,
      dateDisplay: null,
      mediumDisplay: null,
      creditLine: null,
      sourceUrl: null,
    }, null)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 1 of 1: Untitled' }))

    const overlay = screen.getByRole('dialog', { name: 'Untitled' })
    expect(overlay).toHaveTextContent('Artist unknown')
    expect(overlay).toHaveTextContent('Date unavailable')
    expect(overlay).toHaveTextContent('Medium unavailable')
    expect(overlay).toHaveTextContent('Credit line unavailable')
    expect(overlay).toHaveTextContent('No curatorial note.')
    expect(overlay).toHaveTextContent('Artwork source unavailable.')
  })

  it('keeps same-titled artwork information controls and source links distinct', () => {
    render(<InformationSession items={[item(1, 'Untitled'), item(2, 'Untitled')]} />)

    expect(screen.getByRole('button', { name: 'Open information for artwork 1 of 2: Untitled' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('button', { name: 'Open information for artwork 2 of 2: Untitled' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 2 of 2: Untitled' }))
    expect(screen.getByRole('link', { name: 'View source for artwork 2 of 2: Untitled' })).toHaveAttribute('href', 'https://museum.example/2')
  })

  it('reports the final position in a ten-artwork exhibition', () => {
    render(<InformationSession items={Array.from({ length: 10 }, (_value, index) => item(index + 1))} />)
    const next = screen.getByRole('button', { name: 'Next artwork' })
    for (let index = 1; index < 10; index += 1) fireEvent.click(next)

    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 10 of 10: Artwork 10' }))
    expect(screen.getByRole('dialog', { name: 'Artwork 10' })).toHaveTextContent('Artwork 10 of 10')
  })

  it('resets the selection and closes information when the exhibition session changes', () => {
    const { rerender } = render(
      <InformationForExhibition exhibition={{ id: 1, title: 'Exhibition', items: [item(1, 'First'), item(2, 'Second')] }} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open information for artwork 2 of 2: Second' }))
    expect(screen.getByRole('dialog', { name: 'Second' })).toBeInTheDocument()

    rerender(<InformationForExhibition exhibition={{ id: 1, title: 'Exhibition', items: [item(1, 'Reloaded first')] }} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 1: Reloaded first')
  })
})
