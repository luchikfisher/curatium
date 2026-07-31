import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GalleryNavigation } from './GalleryNavigation'
import { gallerySessionKey } from './session'
import { assignArtworkSlots } from './slots'
import type { GalleryExhibition, GalleryItem } from './types'

function item(position: number, title = `Artwork ${position}`): GalleryItem {
  return { id: position + 10, position, artwork: { id: position + 100, title, imageUrl: `https://images.example/${position}.jpg` } }
}

function NavigationSession({ items }: { items: GalleryItem[] }) {
  const assignments = assignArtworkSlots(items)
  const [selectedIndex, setSelectedIndex] = useState(assignments.length > 0 ? 0 : -1)
  return <GalleryNavigation assignments={assignments} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
}

function NavigationForExhibition({ exhibition }: { exhibition: GalleryExhibition }) {
  return <NavigationSession key={gallerySessionKey(exhibition)} items={exhibition.items} />
}

afterEach(cleanup)

describe('gallery navigation', () => {
  it('selects the first curator-ordered artwork on entry and follows that exact order', () => {
    render(<NavigationSession items={[item(3, 'Third'), item(1, 'First'), item(2, 'Second')]} />)

    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 3: First')
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 2 of 3: Second')
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 3 of 3: Third')
  })

  it('enforces previous and next boundaries for one and ten artworks', () => {
    const { rerender } = render(<NavigationSession items={[item(1, 'Only artwork')]} />)
    expect(screen.getByRole('button', { name: 'Previous artwork' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next artwork' })).toBeDisabled()

    rerender(<NavigationSession items={Array.from({ length: 10 }, (_value, index) => item(index + 1))} />)
    const next = screen.getByRole('button', { name: 'Next artwork' })
    for (let index = 1; index < 10; index += 1) fireEvent.click(next)
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 10 of 10: Artwork 10')
    expect(next).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous artwork' })).toBeEnabled()
  })

  it('supports Left and Right Arrow navigation while the navigation region is focused', () => {
    render(<NavigationSession items={[item(1, 'First'), item(2, 'Second')]} />)
    const navigation = screen.getByRole('navigation', { name: 'Artwork navigation' })

    fireEvent.keyDown(navigation, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 2 of 2: Second')
    fireEvent.keyDown(navigation, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 2: First')
  })

  it('resets selection to the first artwork when the exhibition route changes', () => {
    const { rerender } = render(<NavigationForExhibition exhibition={{ id: 1, title: 'First exhibition', items: [item(1, 'First'), item(2, 'Second')] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 2 of 2: Second')

    rerender(<NavigationForExhibition exhibition={{ id: 2, title: 'Second exhibition', items: [item(1, 'New first'), item(2, 'New second')] }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 2: New first')
  })

  it('resets selection when the same exhibition reloads with a changed ordered item list', () => {
    const { rerender } = render(
      <NavigationForExhibition exhibition={{ id: 1, title: 'Exhibition', items: [item(1, 'First'), item(2, 'Second'), item(3, 'Third')] }} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 3 of 3: Third')

    rerender(
      <NavigationForExhibition exhibition={{
        id: 1,
        title: 'Exhibition',
        items: [
          { ...item(1, 'First'), position: 2 },
          { ...item(2, 'Second'), position: 1 },
        ],
      }} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 2: Second')
  })
})
